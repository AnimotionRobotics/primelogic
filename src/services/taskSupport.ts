import type { ResponseName } from '@commontypes/messageType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import type { TaskDetails, TaskRecord, TaskResponsePayload, TaskServiceResultPayload, TaskStatus, TaskType } from '@commontypes/taskType'




// Share the task service result type
export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    responseName?: ResponseName,
    payload?: TaskResponsePayload,
    next?: 'retry' | 'notify'
}


// Set observer departments for each task type
export const taskObserverDepartmentIds: Record<TaskType, string[]> = {
    leave: ['HR']
}


export type TaskDetailsValidator = (details: TaskDetails) => void


// Check leave task details
export const validateLeaveTaskDetails = (details: TaskDetails): void => {

    if (!('leaveType' in details) || !supportedLeaveTypes.includes(details.leaveType)) {
        throw 'INVALID_LEAVE_TYPE'
    }

    const hasValidStartAt = 'startAt' in details && typeof details.startAt === 'number' && Number.isFinite(details.startAt)
    const hasValidEndAt = 'endAt' in details && typeof details.endAt === 'number' && Number.isFinite(details.endAt)

    if (!hasValidStartAt || !hasValidEndAt) {
        throw 'INVALID_LEAVE_TIME'
    }

    if (details.startAt >= details.endAt) {
        throw 'INVALID_LEAVE_TIME_RANGE'
    }
}


// Convert saved Redis Hash fields back to a task record
export const parseTaskRecord = (taskFields: Record<string, string>): TaskRecord => {
    const taskRecord: TaskRecord = {
        taskId: taskFields.taskId,
        taskType: taskFields.taskType as TaskType,
        status: taskFields.status as TaskStatus,

        sourceJobId: taskFields.sourceJobId,

        submitterId: taskFields.submitterId,
        approverIds: JSON.parse(taskFields.approverIds) as string[],
        observerIds: JSON.parse(taskFields.observerIds) as string[],

        title: taskFields.title,
        details: JSON.parse(taskFields.details) as TaskDetails,

        createdAt: Number(taskFields.createdAt),
        updatedAt: Number(taskFields.updatedAt)
    }

    if (taskFields.description !== undefined) {
        taskRecord.description = taskFields.description
    }

    if (taskFields.reviewedAt !== undefined) {
        taskRecord.reviewedAt = Number(taskFields.reviewedAt)
    }

    if (taskFields.reviewComment !== undefined) {
        taskRecord.reviewComment = taskFields.reviewComment
    }

    return taskRecord
}


// Build the payload returned by task service methods
export const buildTaskServiceResultPayload = (taskRecord: TaskRecord): TaskServiceResultPayload => {
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        submitterId: taskRecord.submitterId,
        approverIds: taskRecord.approverIds,
        observerIds: taskRecord.observerIds,

        title: taskRecord.title,
        details: taskRecord.details,

        createdAt: taskRecord.createdAt,
        updatedAt: taskRecord.updatedAt
    }

    if (taskRecord.description !== undefined) {
        taskServiceResultPayload.description = taskRecord.description
    }

    if (taskRecord.reviewedAt !== undefined) {
        taskServiceResultPayload.reviewedAt = taskRecord.reviewedAt
    }

    if (taskRecord.reviewComment !== undefined) {
        taskServiceResultPayload.reviewComment = taskRecord.reviewComment
    }

    return taskServiceResultPayload
}
