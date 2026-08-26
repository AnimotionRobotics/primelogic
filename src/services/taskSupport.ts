import type { ResponseName } from '@commontypes/messageType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import type { TaskDetails, TaskResponsePayload, TaskType } from '@commontypes/taskType'




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
