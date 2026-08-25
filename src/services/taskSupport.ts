import type { ResponseName } from '@commontypes/messageType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import type { TaskAssignment, TaskDetails, TaskResponsePayload } from '@commontypes/taskType'




// Share the task service result type
export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    responseName?: ResponseName,
    payload?: TaskResponsePayload,
    next?: 'retry' | 'notify'
}


// Set the approver and observer for each submitter
export const taskAssignments: Record<string, TaskAssignment> = {
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
