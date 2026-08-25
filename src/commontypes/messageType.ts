import type { AddFileToTaskPayload, CreateTaskPayload, ReviewTaskPayload, UpdateTaskPayload, TaskResponsePayload } from '@commontypes/taskType';

export const supportedJobNames = ['addFileToTask', 'createTask', 'reviewTask', 'updateTask'] as const

export type JobName = typeof supportedJobNames[number]

export type JobPayload = AddFileToTaskPayload | CreateTaskPayload | ReviewTaskPayload | UpdateTaskPayload

export type JobMessage = {
    name: JobName,
    createdAt: number,
    createdBy: string,
    retried: number,
    maxRetry: number,
    lastTriedAt: number,
    payload: JobPayload
}

export type ConsumedJobMessage = JobMessage & {
    streamMessageId: string
    jobId: string,
}

export type ResponseName = 'taskCreated'| 'taskApproved' | 'taskRejected'| 'taskOperationFailed' | 'fileAddedToTask' | 'taskUpdated'

export type ResponseMessageBase = {
    requestJobId: string,
    name: ResponseName,
    createdAt: number,
    createdBy: string,
    retried: number,
    maxRetry: number,
    lastTriedAt: number,
    msg: string
}

export type ResponseMessage =
    ResponseMessageBase & {
        result: 'success',
        payload: TaskResponsePayload,
    }

    | ResponseMessageBase & {
        result: 'error'
    }

export type ConsumedResponseMessage = ResponseMessage & {
    responseId: string,
    streamMessageId: string
}
