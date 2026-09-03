import type { ConsumedJobMessage, ResponseMessage } from '@commontypes/messageType'
import { incrementHashField, setHash } from '@modules/cache'
import { dispatchMessage, getMessage, nAckMessage } from '@modules/mq'
import { logEvent } from '@modules/logger'
import { serviceRoute, type ServiceCallResult } from '@services'
import { onDispatchResponseError, onDlqError, onGetMessageError } from './abnormal'
import { loadJobMessage } from './consumptionSupport'

export type MessageQueueConsumerConfig = {
    streamKey: string
    groupName: string
    consumerName: string
    claimMinIdleTime: number
    responseStreamKey: string
    dlqStreamKey: string
}

export type GetMessageStepResult =
    | { nextStep: 'callService', message: ConsumedJobMessage }
    | { nextStep: 'continue' }
    | { nextStep: 'stop' }

// Get one message and return next step
export const onGetMessage = async (config: MessageQueueConsumerConfig): Promise<GetMessageStepResult> => {
    try {
        // Get one message from the source Stream
        const streamMessage = await getMessage(
            config.streamKey,
            {
                groupName: config.groupName,
                consumerName: config.consumerName,
                claimMinIdleTime: config.claimMinIdleTime
            },
            5000
        )

        // Load the Job record from Cache
        const message = await loadJobMessage(streamMessage)

        logEvent('info', 'mq.source.received', {
            sourceStreamKey: config.streamKey,
            sourceStreamMessageId: message.streamMessageId,
            requestJobId: message.jobId,
            jobName: message.name,
            sourceRetryCount: message.retried,
            maxSourceRetry: message.maxRetry
        })

        return { nextStep: 'callService', message }
    } catch (error: unknown) {
        if (error === 'CONSUME_NOT_ALLOWED') {
            return { nextStep: 'stop' }
        }

        if (error === 'NO_MESSAGE_FOUND') {
            return { nextStep: 'continue' }
        }
        // Critical errors
        if (!onGetMessageError(error)) {
            throw error
        }
        // Push invalid message to DLQ and ack source message
        await onDlqError({
            dlqStreamKey: config.dlqStreamKey,
            sourceStreamKey: config.streamKey,
            sourceGroupName: config.groupName,
            sourceStreamMessageId: error.streamMessageId,
            sourceJobId: error.jobId,
            errorCode: error.code
        })

        return { nextStep: 'continue' }
    }
}




export type CallServiceStepResult =
    | { nextStep: 'pushResponse', serviceResult: ServiceCallResult }
    | { nextStep: 'continue' }

// Call service and return next step
export const onCallService = async (message: ConsumedJobMessage, config: MessageQueueConsumerConfig): Promise<CallServiceStepResult> => {
    // Retry reached maxRetry, move message to DLQ
    if (message.retried >= message.maxRetry) {
        await onDlqError({
            dlqStreamKey: config.dlqStreamKey,
            sourceStreamKey: config.streamKey,
            sourceGroupName: config.groupName,
            sourceStreamMessageId: message.streamMessageId,
            sourceJobId: message.jobId,
            errorCode: 'MAX_RETRY_REACHED'
        })
        return { nextStep: 'continue' }
    }

    // Call service and handle unexpected errors
    const serviceStartedAt = Date.now()
    let serviceResult: ServiceCallResult
    try {
        serviceResult = await serviceRoute(message.name, message.payload, message.jobId)
    } catch (serviceError) {
        const serviceErrorCode = typeof serviceError === 'string' ? serviceError : 'SERVICE_FUNCTION_FAILED'
        logEvent('error', 'service.call.failed', {
            sourceStreamMessageId: message.streamMessageId,
            requestJobId: message.jobId,
            jobName: message.name,
            errorCode: serviceErrorCode,
            errorMessage: serviceError instanceof Error ? serviceError.message: undefined,
            shouldRetryService: false
        })
        serviceResult = { err: true, ack: true, msg: 'SERVICE_FUNCTION_FAILED', responseName: 'taskOperationFailed' }
    }

    logEvent('info', 'service.call.completed', {
        sourceStreamMessageId: message.streamMessageId,
        requestJobId: message.jobId,
        jobName: message.name,
        hasServiceError: serviceResult.err,
        shouldAckSourceMessage: serviceResult.ack,
        resultMessage: serviceResult.msg,
        responseName: serviceResult.responseName,
        durationMs: Date.now() - serviceStartedAt
    })

    // retry
    if (!serviceResult.ack) {
        // Update retry data, then NACK message
        try {
            const retried = await incrementHashField(`jobs:${message.jobId}`, 'retried')
            await setHash(`jobs:${message.jobId}`, { lastTriedAt: Date.now().toString() })
            await nAckMessage(config.streamKey, config.groupName, 'FAIL', [message.streamMessageId])

            logEvent('warn', 'mq.source.nacked', {
                sourceStreamKey: config.streamKey,
                sourceGroupName: config.groupName,
                sourceStreamMessageId: message.streamMessageId,
                requestJobId: message.jobId,
                jobName: message.name,
                errorCode: serviceResult.msg,
                sourceRetryCount: retried,
                maxSourceRetry: message.maxRetry,
                nextAction: retried >= message.maxRetry ? 'moveToDlq' : 'retryService'
            })
        } catch (error) {
            logEvent('error', 'mq.source.retry_setup_failed', {
                sourceStreamKey: config.streamKey,
                sourceGroupName: config.groupName,
                sourceStreamMessageId: message.streamMessageId,
                requestJobId: message.jobId,
                jobName: message.name,
                serviceErrorCode: serviceResult.msg,
                retryErrorCode: typeof error === 'string' ? error : 'SOURCE_RETRY_SETUP_FAILED',
                retryErrorMessage: error instanceof Error ? error.message : undefined,
                maxSourceRetry: message.maxRetry
            })
            throw error
        }

        return { nextStep: 'continue' }
    }

    return { nextStep: 'pushResponse', serviceResult }
}





export type DispatchResponseStepResult = { responseId: string }

// Dispatch service result to mq and return next step
export const onDispatchResponse = async (message: ConsumedJobMessage, serviceResult: ServiceCallResult, config: MessageQueueConsumerConfig): Promise<DispatchResponseStepResult> => {
    // Create response message
    if (!serviceResult.responseName) {
        throw 'MISSING_SERVICE_RESPONSE_NAME'
    }

    // build responseId
    const responseId = Bun.hash(`response:${message.jobId}`).toString()
    const responseCreatedAt = Date.now()
    const responseMessageBase = {
        requestJobId: message.jobId,
        name: serviceResult.responseName,
        createdAt: responseCreatedAt,
        createdBy: config.groupName,
        retried: 0,
        maxRetry: message.maxRetry,
        lastTriedAt: responseCreatedAt,
        msg: serviceResult.msg ?? (serviceResult.err ? 'SERVICE_ERROR' : 'SERVICE_SUCCESS')
    }

    let responseMessage: ResponseMessage
    if (serviceResult.err) {
        responseMessage = { ...responseMessageBase, result: 'error' }
    } else {
        if (!serviceResult.payload) {
            throw 'MISSING_SERVICE_RESPONSE_PAYLOAD'
        }
        responseMessage = { ...responseMessageBase, result: 'success', payload: serviceResult.payload }
    }

    // Convert response values to Redis Hash strings
    const responseHashRecord: Record<string, string> = {}
    for (const [field, value] of Object.entries(responseMessage)) {
        responseHashRecord[field] = typeof value === 'object' ? JSON.stringify(value) : String(value)
    }

    const maxDispatchRetry = 3
    let dispatchRetryCount = 0
    let responseStage: 'save' | 'dispatch' = 'save'

    // Retry temporary Redis and network errors
    while (true) {
        try {
            responseStage = 'save'
            await setHash(`responses:${responseId}`, responseHashRecord)

            responseStage = 'dispatch'
            await dispatchMessage(config.responseStreamKey, responseId)
            break
        } catch (dispatchError) {
            let errorCode: string | undefined
            let errorMessage: string
            // MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED
            if (typeof dispatchError === 'string') {
                errorMessage = dispatchError
            } else if (dispatchError instanceof Error) {
                errorMessage = dispatchError.message

                if ('code' in dispatchError && typeof dispatchError.code === 'string') {
                    errorCode = dispatchError.code
                }
            } else {
                    logEvent('error', 'mq.response.dispatch_failed', {
                        responseStreamKey: config.responseStreamKey,
                        responseId,
                        sourceStreamMessageId: message.streamMessageId,
                        requestJobId: responseMessage.requestJobId,
                        jobName: message.name,
                        responseName: responseMessage.name,
                        errorCode: 'UNKNOWN_RESPONSE_DISPATCH_ERROR',
                        responseStage,
                        dispatchRetryCount,
                        maxDispatchRetry
                    })

                throw dispatchError
            }

            const canRetry = onDispatchResponseError(errorCode, errorMessage)
            if (!canRetry || dispatchRetryCount >= maxDispatchRetry) {
                logEvent('error', 'mq.response.dispatch_failed', {
                    responseStreamKey: config.responseStreamKey,
                    responseId,
                    sourceStreamMessageId: message.streamMessageId,
                    requestJobId: responseMessage.requestJobId,
                    jobName: message.name,
                    responseName: responseMessage.name,
                    errorCode: errorCode ?? errorMessage,
                    errorMessage,
                    responseStage,
                    dispatchRetryCount,
                    maxDispatchRetry
                })
                throw dispatchError
            }

            // Double the wait time after each failed dispatch
            const retryDelay = 500 * 2 ** dispatchRetryCount
            dispatchRetryCount += 1

            logEvent('warn', 'mq.response.retry_scheduled', {
                responseStreamKey: config.responseStreamKey,
                responseId,
                sourceStreamMessageId: message.streamMessageId,
                requestJobId: responseMessage.requestJobId,
                jobName: message.name,
                responseName: responseMessage.name,
                errorCode: errorCode ?? errorMessage,
                errorMessage,
                responseStage,
                dispatchRetryCount,
                maxDispatchRetry,
                retryDelayMs: retryDelay
            })

            await Bun.sleep(retryDelay)
        }
    }

    logEvent('info', 'mq.response.dispatched', {
        responseStreamKey: config.responseStreamKey,
        responseId,
        sourceStreamMessageId: message.streamMessageId,
        requestJobId: responseMessage.requestJobId,
        jobName: message.name,
        responseName: responseMessage.name,
        responseResult: responseMessage.result,
        resultMessage: responseMessage.msg,
        dispatchRetryCount,
        maxDispatchRetry
    })

    return { responseId }
}
