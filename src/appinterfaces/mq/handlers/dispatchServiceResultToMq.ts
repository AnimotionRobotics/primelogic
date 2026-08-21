import type { ConsumedJobMessage, ResponseMessage } from '@commontypes/messageType'
import { cacheClient } from '@modules/cache'
import { dispatchMessage } from '@modules/mq'
import type { ServiceCallResult } from '@services'
import type { MessageQueueConsumerConfig } from './getMessageFromMq'

export type DispatchServiceResultToMqResult = {
    nextStep: 'ack',
    responseId: string
}

// Dispatch service result to mq and return next step
export const dispatchServiceResultToMq = async (message: ConsumedJobMessage, serviceResult: ServiceCallResult, config: MessageQueueConsumerConfig): Promise<DispatchServiceResultToMqResult> => {
    // Create response message
    if (!serviceResult.responseName) throw 'MISSING_SERVICE_RESPONSE_NAME'

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

    return { nextStep: 'ack', responseId }
}
