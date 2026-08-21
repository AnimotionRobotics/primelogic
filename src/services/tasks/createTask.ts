import { getHashAllFields, setHash } from '@modules/cache'
import type { CreateTaskPayload, TaskAssignment, TaskRecord, TaskServiceResultPayload } from '@commontypes/taskType'
import type { HandlerResult } from './index'

const taskAssignments: Record<string, TaskAssignment> = {
    'leave:U0AMWQX3CQG': {
        taskType: 'leave',
        submitterId: 'U0AMWQX3CQG',
        approverId: 'U0BJR2NMZ6D',
        observerId: 'U0BJR2NMZ6D'
    },

    'leave:U0BJR2NMZ6D': {
        taskType: 'leave',
        submitterId: 'U0BJR2NMZ6D',
        approverId: 'U0AMWQX3CQG',
        observerId: 'U0BJR2NMZ6D'
    }
}

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

    if (!payload.title || typeof payload.title !== 'string') {
        throw 'INVALID_TASK_TITLE'
    }

    if (!payload.submitterId || typeof payload.submitterId !== 'string') {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    if (!payload.details || typeof payload.details !== 'object' || !('leaveType' in payload.details)) {
        throw 'INVALID_TASK_DETAILS'
    }

    switch (payload.taskType) {
        case 'leave': {
            const hasValidStartAt = 'startAt' in payload.details && typeof payload.details.startAt === 'number' && Number.isFinite(payload.details.startAt)
            const hasValidEndAt = 'endAt' in payload.details && typeof payload.details.endAt === 'number' && Number.isFinite(payload.details.endAt)

            if (!hasValidStartAt || !hasValidEndAt) {
                throw 'INVALID_LEAVE_TASK_DETAILS'
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
            taskType: taskRecord.taskType,
            status: taskRecord.status,

            submitterId: existingTaskFields.submitterId,
            approverId: existingTaskFields.approverId,
            observerId: existingTaskFields.observerId,

            title: existingTaskFields.title,
            description: existingTaskFields.description,
            details: taskRecord.details
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
        description: taskRecord.description,
        details: taskRecord.details
    }

    return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: taskServiceResultPayload }
}
