import type { AddFileToTaskPayload, CreateTaskPayload, ReviewTaskPayload, TaskResponsePayload, ListTasksPayload, CancelTaskPayload, RevokeTaskPayload } from '@commontypes/taskType';

export const supportedJobNames = ['addFileToTask', 'createTask', 'reviewTask', 'listTasks', 'cancelTask', 'revokeTask'] as const

export type JobName = typeof supportedJobNames[number]

export type JobPayload = AddFileToTaskPayload | CreateTaskPayload | ReviewTaskPayload | ListTasksPayload | CancelTaskPayload | RevokeTaskPayload
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

export type ResponseName = 'taskCreated'| 'taskApproved' | 'taskRejected'| 'taskOperationFailed' | 'fileAddedToTask' | 'taskListed' | 'taskCancelled' | 'taskRevocationWaiting' | 'taskRevocationRejected' | 'taskRevoked'

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
