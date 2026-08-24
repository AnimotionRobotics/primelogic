import { getHashAllFields, setHash, deleteHashFields } from '@modules/cache'
import type { UpdateTaskPayload, TaskServiceResultPayload } from '@commontypes/taskType'
import { supportedLeaveTypes } from '@/commontypes/leaveTaskType'
import type { HandlerResult } from './index'

// Update a task and reset it to pending for another review
export const updateTask = async (payload: UpdateTaskPayload, requestJobId: string): Promise<HandlerResult> => {
    if (!payload) {
        throw 'MISSING_PARAMETER_PAYLOAD'
    }

    if (!requestJobId) {
        throw 'MISSING_PARAMETER_REQUEST_JOB_ID'
    }

    const hasRequiredUpdateFields = typeof payload === 'object' && payload !== null &&  'taskId' in payload && 'submitterId' in payload && 'title' in payload && 'details' in payload

    if (!hasRequiredUpdateFields) {
        throw 'INVALID_UPDATE_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    const taskKey = `tasks:${payload.taskId}`
    let taskFields: Record<string, string>
    try {
        taskFields = await getHashAllFields(taskKey)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }
        throw error
    }

    if (taskFields.taskId !== payload.taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    if (taskFields.submitterId !== payload.submitterId) {
        return { res: 'error', msg: 'TASK_UPDATE_FORBIDDEN' }
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

    switch (taskFields.taskType) {
        case 'leave': {
            if (!supportedLeaveTypes.includes(payload.details.leaveType)) {
                throw 'INVALID_LEAVE_TYPE'
            }

            const hasValidStartAt = typeof payload.details.startAt === 'number' && Number.isFinite(payload.details.startAt)
            const hasValidEndAt =  typeof payload.details.endAt === 'number' && Number.isFinite(payload.details.endAt)
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

    const updatedFields: Record<string, string> = {
        status: 'PENDING',
        title: payload.title,
        details: JSON.stringify(payload.details),
        updatedAt: Date.now().toString()
    }

    if (payload.description !== undefined) {
        updatedFields.description = payload.description
    }

    await setHash(taskKey, updatedFields)

    await deleteHashFields(taskKey, ['reviewedAt', 'reviewComment'])
    
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskFields.taskId,
        taskType: taskFields.taskType,
        status: 'PENDING',

        submitterId: taskFields.submitterId,
        approverId: taskFields.approverId,
        observerId: taskFields.observerId,

        title: payload.title,
        details: payload.details
    }

    const updatedDescription = payload.description ?? taskFields.description

    if (updatedDescription !== undefined) {
        taskServiceResultPayload.description = updatedDescription
    }

    return { res: 'success', msg: 'TASK_UPDATED', responseName: 'taskUpdated',  payload: taskServiceResultPayload }
}
