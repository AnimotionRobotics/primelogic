import type { CreateLeaveTaskPayload, LeaveTaskDetails, LeaveType, UpdateLeaveTaskPayload } from '@commontypes/leaveTaskType'

export const supportedTaskTypes = ['leave'] as const

export type TaskType = typeof supportedTaskTypes[number]


export const supportedTaskStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'DELETED'] as const

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

export type UpdateTaskPayload = UpdateLeaveTaskPayload

export type ReviewDecision = 'approve' | 'reject'

export type ReviewTaskPayload = {
    taskId: string,
    approverId: string,
    decision: ReviewDecision,
    comment?: string
}

export type DeleteTaskPayload = {
    taskId: string,
    submitterId: string
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
    approverId?: never
}

type ListTasksByApproverPayload = ListTasksFilter & {
    submitterId?: never,
    approverId: string
}

export type ListTasksPayload = ListTasksBySubmitterPayload | ListTasksByApproverPayload

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
    approverIds: string[],
    observerIds: string[],

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
    approverIds: string[],
    observerIds: string[],

    title: string,
    description?: string,
    details: TaskDetails,

    createdAt: number,
    updatedAt: number,

    reviewedAt?: number,
    reviewComment?: string
}

export type ListTasksResponsePayload = TaskServiceResultPayload[]

export type AddFileToTaskResponsePayload = {
    fileId: string,
    taskIds: string[]
}

export type TaskResponsePayload = AddFileToTaskResponsePayload | TaskServiceResultPayload | ListTasksResponsePayload
