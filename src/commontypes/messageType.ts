import type {
    AddFileToTaskPayload,
    CreateTaskPayload,
    ReviewTaskPayload,
    TaskResponsePayload
} from '@commontypes/taskType';


export type JobName = 'addFileToTask' | 'createTask' | 'reviewTask'


export type JobPayload = AddFileToTaskPayload | CreateTaskPayload | ReviewTaskPayload


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


export type ResponseError = {
    code: string,
    message: string
}

export type ResponseName = 'taskCreated'| 'taskApproved' | 'taskRejected'| 'taskOperationFailed' | 'fileAddedToTask'

export type ResponseMessageBase = {
    requestJobId: string,
    name: ResponseName,
    createdAt: number,
    createdBy: string,
    retried: number,
    maxRetry: number,
    lastTriedAt: number
}


export type ResponseMessage =
    ResponseMessageBase & {
        result: 'success',
        payload: TaskResponsePayload,
    }

    | ResponseMessageBase & {
        result: 'error',
        error: ResponseError
    }



export type ConsumedResponseMessage = ResponseMessage & {
    responseId: string,
    streamMessageId: string
}