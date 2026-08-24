import { getHashAllFields, setHash } from '@modules/cache'
import type { CreateTaskPayload, TaskRecord, TaskServiceResultPayload, TaskStatus, TaskType, TaskDetails } from '@commontypes/taskType'
import { supportedLeaveTypes } from '@/commontypes/leaveTaskType'
import type { HandlerResult } from './index'
import { taskAssignments } from './taskAssignments'


// Create a task and save it
export const createTask = async (payload: CreateTaskPayload, requestJobId: string): Promise<HandlerResult> => {

    if (!payload) {
        throw 'MISSING_PARAMETER_PAYLOAD'
    }

    if (!requestJobId) {
        throw 'MISSING_PARAMETER_REQUEST_JOB_ID'
    }

    if (typeof payload !== 'object' || !('taskType' in payload)) {
        throw 'INVALID_CREATE_TASK_PAYLOAD'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
        throw 'INVALID_TASK_TITLE'
    }

    if (payload.description !== undefined && typeof payload.description !== 'string') {
        throw 'INVALID_TASK_DESCRIPTION'
    }

    if (!payload.details || typeof payload.details !== 'object') {
        throw 'INVALID_TASK_DETAILS'
    }

    switch (payload.taskType) {
        case 'leave': {
            if (!('leaveType' in payload.details) || !supportedLeaveTypes.includes(payload.details.leaveType)) {
                throw 'INVALID_LEAVE_TYPE'
            }
            const hasValidStartAt = 'startAt' in payload.details && typeof payload.details.startAt === 'number' && Number.isFinite(payload.details.startAt)
            const hasValidEndAt = 'endAt' in payload.details && typeof payload.details.endAt === 'number' && Number.isFinite(payload.details.endAt)

            if (!hasValidStartAt || !hasValidEndAt) {
                throw 'INVALID_LEAVE_TIME'
            }

            if (payload.details.startAt >= payload.details.endAt) {
                throw 'INVALID_LEAVE_TIME_RANGE'
            }

            break
        }

        default:
            throw 'UNSUPPORTED_TASK_TYPE'
    }

    // Find the task assignment
    const taskAssignmentKey = `${payload.taskType}:${payload.submitterId}`
    const taskAssignment = taskAssignments[taskAssignmentKey]
    if (!taskAssignment) {
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Build the task record
    const taskId = Bun.hash(`task:${requestJobId}`).toString()
    const now = Date.now()

    const taskRecord: TaskRecord = {
        taskId,
        taskType: payload.taskType,
        status: 'PENDING',

        sourceJobId: requestJobId,

        submitterId: payload.submitterId,
        approverId: taskAssignment.approverId,
        observerId: taskAssignment.observerId,

        title: payload.title,
        description: payload.description,
        details: payload.details,

        createdAt: now,
        updatedAt: now
    }

    const taskKey = `tasks:${taskId}`

    // Check whether the task already exists
    let existingTaskFields: Record<string, string> | undefined
    try {
        existingTaskFields = await getHashAllFields(taskKey)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') {
            throw error
        }
    }

    if (existingTaskFields && existingTaskFields.sourceJobId !== requestJobId) {
        return { res: 'error', msg: 'TASK_ALREADY_EXISTS' }
    }

    // Return the saved task when the same request is retried
    if (existingTaskFields) {
        const existingTaskServiceResultPayload: TaskServiceResultPayload = {
            taskId: existingTaskFields.taskId,
            taskType: existingTaskFields.taskType as TaskType,
            status: existingTaskFields.status as TaskStatus,

            submitterId: existingTaskFields.submitterId,
            approverId: existingTaskFields.approverId,
            observerId: existingTaskFields.observerId,

            title: existingTaskFields.title,
            details: JSON.parse(existingTaskFields.details) as TaskDetails
        }

        if (existingTaskFields.description !== undefined) {
            existingTaskServiceResultPayload.description = existingTaskFields.description
        }

        return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: existingTaskServiceResultPayload }
    }

    const taskHashFields: Record<string, string> = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        sourceJobId: taskRecord.sourceJobId,

        submitterId: taskRecord.submitterId,
        approverId: taskRecord.approverId,
        observerId: taskRecord.observerId,

        title: taskRecord.title,
        details: JSON.stringify(taskRecord.details),

        createdAt: taskRecord.createdAt.toString(),
        updatedAt: taskRecord.updatedAt.toString()
    }

    if (taskRecord.description !== undefined) {
        taskHashFields.description = taskRecord.description
    }

    // Save the task record
    await setHash(taskKey, taskHashFields)

    // Build the service response
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        submitterId: taskRecord.submitterId,
        approverId: taskRecord.approverId,
        observerId: taskRecord.observerId,

        title: taskRecord.title,
        details: taskRecord.details
    }

    if (taskRecord.description !== undefined) {
        taskServiceResultPayload.description = taskRecord.description
    }

    return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: taskServiceResultPayload }
}
