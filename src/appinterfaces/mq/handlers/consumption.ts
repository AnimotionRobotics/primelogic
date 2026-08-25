import type { ConsumedJobMessage, ResponseMessage } from '@commontypes/messageType'
import { cacheClient, incrementHashField, setHash } from '@modules/cache'
import { dispatchMessage, getMessage, nAckMessage } from '@modules/mq'
import { serviceRoute, type ServiceCallResult } from '@services'
import { onDlqError, onGetMessageError } from './abnormal'

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
        const message = await getMessage(
            config.streamKey,
            {
                groupName: config.groupName,
                consumerName: config.consumerName,
                claimMinIdleTime: config.claimMinIdleTime
            },
            5000
        )

        console.info('Received source message from mq: ', {
            streamMessageId: message.streamMessageId,
            jobId: message.jobId,
            name: message.name,
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

    // Call service and handle errors
    const serviceStartedAt = Date.now()
    let serviceResult: ServiceCallResult
    try {
        serviceResult = await serviceRoute(message.name, message.payload, message.jobId)
    } catch (serviceError) {
        console.error('Service execution failed: ', {
            error: serviceError,
            streamMessageId: message.streamMessageId,
            jobId: message.jobId,
            name: message.name
        })
        serviceResult = { err: true, ack: true, msg: 'SERVICE_FUNCTION_FAILED', responseName: 'taskOperationFailed' }
    }

    console.info('Service call completed: ', {
        streamMessageId: message.streamMessageId,
        jobId: message.jobId,
        name: message.name,
        err: serviceResult.err,
        ack: serviceResult.ack,
        msg: serviceResult.msg,
        responseName: serviceResult.responseName,
        serviceDurationMs: Date.now() - serviceStartedAt
    })

    // retry
    if (!serviceResult.ack) {
        // Update retry data, then NACK message
        try {
            const retried = await incrementHashField(`jobs:${message.jobId}`, 'retried')
            await setHash(`jobs:${message.jobId}`, { lastTriedAt: Date.now().toString() })
            await nAckMessage(config.streamKey, config.groupName, 'FAIL', [message.streamMessageId])

            console.warn('Source message released after service failure: ', {
                streamMessageId: message.streamMessageId,
                jobId: message.jobId,
                sourceRetryCount: retried,
                maxSourceRetry: message.maxRetry,
                nextStep: retried >= message.maxRetry ? 'moveToDlq' : 'retryService'
            })
        } catch (error) {
            console.error('Failed to release source message after service failure: ', {
                error,
                streamMessageId: message.streamMessageId,
                jobId: message.jobId
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

    const responseCreatedAt = Date.now()
    const responseId = Bun.hash(`response:${message.jobId}`).toString()
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

    const responseMessageFields = [
        'requestJobId', responseMessage.requestJobId,
        'name', responseMessage.name,
        'createdAt', responseMessage.createdAt.toString(),
        'createdBy', responseMessage.createdBy,
        'retried', responseMessage.retried.toString(),
        'maxRetry', responseMessage.maxRetry.toString(),
        'lastTriedAt', responseMessage.lastTriedAt.toString(),
        'result', responseMessage.result,
        'msg', responseMessage.msg
    ]

    if (responseMessage.result === 'success') {
        responseMessageFields.push('payload', JSON.stringify(responseMessage.payload))
    }

    const maxDispatchRetry = 3
    const retryableErrorCodes = [
        // Bun Redis connection error
        'ERR_REDIS_CONNECTION_CLOSED',
        // Network errors
        'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
        // Redis temporary errors
        'BUSY', 'TRYAGAIN', 'LOADING'
    ]

    let dispatchRetryCount = 0

    // Retry temporary Redis and network errors
    while (true) {
        try {
            await dispatchMessage(config.responseStreamKey, responseId, cacheClient, responseMessageFields)
            break
        } catch (dispatchError) {
            console.error('Response dispatch failed: ', dispatchError)

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
                throw dispatchError
            }

            // Check each retryable error
            const canRetry = retryableErrorCodes.some(retryableCode => errorCode === retryableCode || errorMessage.startsWith(retryableCode))

            if (!canRetry || dispatchRetryCount >= maxDispatchRetry) {
                throw dispatchError
            }

            // Double the wait time after each failed dispatch
            const retryDelay = 500 * 2 ** dispatchRetryCount
            dispatchRetryCount += 1

            console.warn('Retrying response dispatch: ', {
                responseId,
                requestJobId: responseMessage.requestJobId,
                dispatchRetryCount,
                maxDispatchRetry,
                retryDelay
            })

            await Bun.sleep(retryDelay)
        }
    }

    console.info('Response dispatched to mq: ', {
        responseId,
        requestJobId: responseMessage.requestJobId,
        responseName: responseMessage.name,
        result: responseMessage.result,
        msg: responseMessage.msg,
        dispatchRetryCount,
        maxDispatchRetry
    })

    return { responseId }
}
