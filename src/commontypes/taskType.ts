import type { CreateLeaveTaskPayload, LeaveTaskDetails, LeaveType } from '@commontypes/leaveTaskType'

export const supportedTaskTypes = ['leave'] as const

export type TaskType = typeof supportedTaskTypes[number]


export const supportedTaskStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WAITING_REVOKE', 'REVOKED'] as const

export type TaskStatus = typeof supportedTaskStatuses[number]

export type TaskDetails = LeaveTaskDetails

export type AddFileToTaskPayload = {
    fileId: string,
    selectedValues: string[],
    userId: string,
    metadata: string,
    responseUrl?: string
}

export type CreateTaskPayload = CreateLeaveTaskPayload

export type ReviewDecision = 'approve' | 'reject'

type ReviewTaskPayloadBase = {
    taskId: string,
    approverId: string,
    decision: ReviewDecision,
    comment?: string
}

export type ReviewCreationTaskPayload = ReviewTaskPayloadBase & {
    reviewType: 'creation'
}

export type ReviewRevocationTaskPayload = ReviewTaskPayloadBase & {
    reviewType: 'revocation',
    revokeRequestId: string
}

export type ReviewTaskPayload = ReviewCreationTaskPayload | ReviewRevocationTaskPayload

export type CancelTaskPayload = {
    taskId: string,
    submitterId: string,
    reason?: string
}

export type RevokeTaskPayload = {
    taskId: string,
    submitterId: string,
    reason?: string
}

type ListTasksFilter = {
    taskId?: string,
    taskType?: TaskType,
    status?: TaskStatus,
    leaveType?: LeaveType,

    createdAtFrom?: number,
    createdAtTo?: number,

    reviewedAtFrom?: number,
    reviewedAtTo?: number
}

type ListTasksBySubmitterPayload = ListTasksFilter & {
    submitterId: string,
    approverId?: never,
    observerId?: never
}

type ListTasksByApproverPayload = ListTasksFilter & {
    submitterId?: never,
    approverId: string,
    observerId?: never
}

type ListTasksByObserverPayload = ListTasksFilter & {
    submitterId?: never,
    approverId?: never,
    observerId: string
}

export type ListTasksPayload = ListTasksBySubmitterPayload | ListTasksByApproverPayload | ListTasksByObserverPayload

export type TaskAssignment = {
    taskType: TaskType,
    submitterId: string,
    approverIds: string[],
    observerIds: string[]
}

export type TaskRecord = {
    taskId: string,
    taskType: TaskType,
    status: TaskStatus,

    sourceJobId: string,

    submitterId: string,
    submitterName: string,
    approverIds: string[],
    observerIds: string[],

    title: string,
    description?: string,
    details: TaskDetails,

    createdAt: number,
    updatedAt: number,

    reviewedAt?: number,
    reviewComment?: string,

    pendingRevokeRequestId?: string,

    cancelledAt?: number,
    cancelledReason?: string,

    revokedAt?: number,
    revokeReason?: string,
    revokeComment?: string
}

export const supportedTaskHistoryActions = ['CREATED', 'CANCELLED', 'CREATION_APPROVED', 'CREATION_REJECTED', 'REVOCATION_REQUESTED', 'REVOCATION_APPROVED', 'REVOCATION_REJECTED'] as const

export type TaskHistoryAction = typeof supportedTaskHistoryActions[number]

// Task history fields
type TaskHistoryRecordBase = {
    sequence: number,
    requestJobId: string,
    action: TaskHistoryAction,
    operatorId: string,
    currentStatus: TaskStatus,
    createdAt: number,
    comment?: string
}

// Fields for created tasks
type TaskCreatedHistoryFields = {
    taskType: TaskType,
    submitterId: string,
    submitterName: string,
    approverIds: string[],
    observerIds: string[],
    title: string,
    description?: string,
    details: TaskDetails
}

type TaskHistoryActionFields =
    | ({ action: 'CREATED' } & TaskCreatedHistoryFields)
    | { action: Exclude<TaskHistoryAction, 'CREATED'> } // Exclude 'CREATED' from TaskHistoryAction

// Saved task history record
export type TaskHistoryRecord = TaskHistoryRecordBase & TaskHistoryActionFields

// Task history input
export type AppendTaskHistoryInput = Omit<TaskHistoryRecordBase, 'sequence'> & TaskHistoryActionFields

export type TaskServiceResultPayload = {
    taskId: string,
    taskType: TaskType,
    status: TaskStatus,

    submitterId: string,
    submitterName: string,
    approverIds: string[],
    observerIds: string[],

    title: string,
    description?: string,
    details: TaskDetails,

    createdAt: number,
    updatedAt: number,

    reviewedAt?: number,
    reviewComment?: string,

    pendingRevokeRequestId?: string,

    cancelledAt?: number,
    cancelledReason?: string,

    revokedAt?: number,
    revokeReason?: string,
    revokeComment?: string
}

export type ListTasksResponsePayload = TaskServiceResultPayload[]

export type AddFileToTaskResponsePayload = {
    fileId: string,
    taskIds: string[]
}


export type TaskResponsePayload = AddFileToTaskResponsePayload | TaskServiceResultPayload | ListTasksResponsePayload
