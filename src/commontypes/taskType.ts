import type { CreateLeaveTaskPayload, LeaveTaskDetails, UpdateLeaveTaskPayload } from '@commontypes/leaveTaskType'

export const supportedTaskTypes = ['leave'] as const

export type TaskType = typeof supportedTaskTypes[number]


export const supportedTaskStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const

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

type ListTasksFilter = {
    taskType?: TaskType,
    status?: TaskStatus,

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
