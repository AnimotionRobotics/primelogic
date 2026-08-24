import type { CreateLeaveTaskPayload, LeaveTaskDetails, UpdateLeaveTaskPayload } from '@/commontypes/leaveTaskType'

export type TaskType = 'leave'

export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type TaskDetails = LeaveTaskDetails

export type AddFileToTaskPayload = {
    fileId: string,
    selectedValues: string[],
    userId: string,
    metadata: string,
    responseUrl?: string
}

export type CreateTaskPayload = CreateLeaveTaskPayload

export type UpdateTaskPayload = UpdateLeaveTaskPayload

export type ReviewDecision = 'approve' | 'reject'

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
    details: TaskDetails,

    createdAt: number,
    updatedAt: number,

    reviewedAt?: number,
    reviewComment?: string
}

export type TaskServiceResultPayload = {
    taskId: string,
    taskType: TaskType,
    status: TaskStatus,

    submitterId: string,
    approverId: string,
    observerId: string,

    title: string,
    description?: string,
    details: TaskDetails,

    reviewComment?: string
}

export type AddFileToTaskResponsePayload = {
    fileId: string,
    taskIds: string[]
}

export type TaskResponsePayload = AddFileToTaskResponsePayload | TaskServiceResultPayload
