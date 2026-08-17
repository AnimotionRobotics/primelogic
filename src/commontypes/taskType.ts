export type TaskType = 'leave'


export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED'


export type ReviewDecision = 'APPROVE' | 'REJECT'


export type LeaveTaskDetails = {
    leaveType: 'annual' | 'sick',
    startAt: number,
    endAt: number
}

export type AddFileToTaskPayload = {
    fileId: string,
    selectedValues: string[],
    userId: string,
    metadata: string,
    responseUrl?: string
}

export type CreateLeaveTaskPayload = {
    taskType: 'leave',
    title: string,
    description?: string,
    submitterId: string,
    details: LeaveTaskDetails
}


export type ReviewTaskPayload = {
    taskId: string,
    approverId: string,
    decision: ReviewDecision,
    comment?: string
}


export type TaskAssignment = {
    taskType: TaskType,
    submitterId: string,
    approverId: string,
    observerId: string
}


export type TaskRecord = {
    taskId: string,
    taskType: TaskType,
    status: TaskStatus,

    sourceJobId: string,

    submitterId: string,
    approverId: string,
    observerId: string,

    title: string,
    description?: string,
    details: LeaveTaskDetails,

    createdAt: number,
    updatedAt: number,

    reviewedAt?: number,
    reviewComment?: string
}


export type TaskResponsePayload = {
    taskId: string,
    taskType: TaskType,
    status: TaskStatus,

    submitterId: string,
    approverId: string,
    observerId: string,

    title: string,
    description?: string,
    details: LeaveTaskDetails,

    reviewComment?: string
}