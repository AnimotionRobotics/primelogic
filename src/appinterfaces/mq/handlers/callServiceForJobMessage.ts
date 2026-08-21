import type { ConsumedJobMessage } from '@commontypes/messageType'
import { incrementHashField, setHash } from '@modules/cache'
import { nAckMessage } from '@modules/mq'
import { serviceRoute, type ServiceCallResult } from '@services'
import type { MessageQueueConsumerConfig } from './getMessageFromMq'
import { moveToDlqAndAckSourceMessage } from './moveToDlqAndAck'

export type CallServiceForJobMessageResult =
    | { nextStep: 'pushResponse', serviceResult: ServiceCallResult }
    | { nextStep: 'continue' }

// Call service and return next step
export const callServiceForJobMessage = async (message: ConsumedJobMessage, config: MessageQueueConsumerConfig): Promise<CallServiceForJobMessageResult> => {
    // Retry reached maxRetry, move message to DLQ
    if (message.retried >= message.maxRetry) {
        await moveToDlqAndAckSourceMessage({
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
