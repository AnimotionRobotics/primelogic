/**
 * App Interface: Message Queue
 * Receiving messages from message queue, processing messages with business logic by calling respective handlers
 */
import type { ConsumedJobMessage, ResponseMessage } from "@commontypes/messageType"
import { ackMessage, connectMessageQueue, disconnectMessageQueue, dispatchMessage, nAckMessage } from "@modules/mq"
import { createStreamGroup } from '@modules/mq'
import { allowConsuming, setAllowConsume, getMessage } from '@modules/mq'
import { cacheClient, incrementHashField, setHash } from '@modules/cache'
import { onMessageQueueConnect, onMessageQueueClose, onGetMessageError } from "./handlers"
import { moveToDlqAndAckSourceMessage } from "./handlers/deadletters"
import { serviceRoute, type ServiceCallResult } from '@services'



export { disconnectMessageQueue, setAllowConsume }




 /**
  * Initialize Message Queue
  */
export const initMessageQueue = async (redisConnectionString: string, config: {targetStreamKey: string, targetStreamConsumerGroup: string, listenStreamKey: string, listenStreamConsumerGroup: string}) => {

    // step 1: connect to redis server
    try {
        await connectMessageQueue(redisConnectionString, { onMessageQueueConnect, onMessageQueueClose })
        setAllowConsume(true)
        // console.log('set setAllowConsume', true)
    } catch (e) {
        console.error('Failed connect to message queue: ', e)
        throw e
    }


    // step 2: prepare stream with consumer group
    try {
        await createStreamGroup(config.targetStreamKey, config.targetStreamConsumerGroup)
        await createStreamGroup(config.listenStreamKey, config.listenStreamConsumerGroup)
    } catch (e: any) {
        if (e.message && e.message.includes('BUSYGROUP Consumer Group name already exists')) {
            console.log('Consumer Group name already exists')
        } else {
            console.error('Error when createStreamGroup()', e)
        }
        throw e
    }

}




/**
 * Start Consuming Message Queue
 * Since it is using blocking listening, this process should be the last one of Initialize process in top level script
 */
export const initConsumingMessageQueue = async (streamKey: string, groupName: string, consumerName: string, claimMinIdleTime: number, responseStreamKey: string, dlqStreamKey: string) => {

    console.log('Now listening message queue: ', streamKey)

    while (allowConsuming) {
        // step 1: get queued message
        let msgResult: ConsumedJobMessage
        try {
            msgResult = await getMessage(streamKey, { groupName, consumerName, claimMinIdleTime }, 5000)
        } catch (e: unknown) {
            if (e === 'CONSUME_NOT_ALLOWED') break
            // Normal timeout: no new message within 5 seconds
            if (e === 'NO_MESSAGE_FOUND') continue

            const canPushToDlq = onGetMessageError(e, streamKey, groupName, consumerName)

            // Throw critical errors for apphandlers to handle.
            if (!canPushToDlq) throw e
            // Push invalid message to DLQ and ack
            await moveToDlqAndAckSourceMessage({
                dlqStreamKey,
                sourceStreamKey: streamKey,
                sourceGroupName: groupName,
                sourceStreamMessageId: e.streamMessageId,
                sourceJobId: e.jobId,
                errorCode: e.code
            })

            continue
        }

        console.info('Received message from mq: ', { streamMessageId: msgResult.streamMessageId, jobId: msgResult.jobId, name: msgResult.name })


        // step 2: call service
        let serviceResult: ServiceCallResult

        if (msgResult.retried >= msgResult.maxRetry) {
            // Push to DLQ and ack message
            await moveToDlqAndAckSourceMessage({
                dlqStreamKey,
                sourceStreamKey: streamKey,
                sourceGroupName: groupName,
                sourceStreamMessageId: msgResult.streamMessageId,
                sourceJobId: msgResult.jobId,
                errorCode: 'MAX_RETRY_REACHED'
            })

            continue
        }

        try {
            serviceResult = await serviceRoute(msgResult.name, msgResult.payload)
        } catch (serviceError) {
            console.error('Service execution failed: ', { error: serviceError, streamMessageId: msgResult.streamMessageId, jobId: msgResult.jobId, name: msgResult.name })
            serviceResult = { err: true, ack: false, msg: 'SERVICE_FUNCTION_FAILED'}
        }

        if (!serviceResult.ack) {
            try {
                // retried + 1
                const retried = await incrementHashField(`jobs:${msgResult.jobId}`, 'retried')
                // update lastTriedAt
                await setHash(`jobs:${msgResult.jobId}`, { lastTriedAt: Date.now().toString() })
                // XNACK
                await nAckMessage(streamKey, groupName, 'FAIL', [msgResult.streamMessageId])
                console.warn('Message released for retry: ', { streamMessageId: msgResult.streamMessageId, jobId: msgResult.jobId, retried, maxRetry: msgResult.maxRetry })
            } catch (e) {
                console.error('Failed to prepare message retry', { e, streamMessageId: msgResult.streamMessageId, jobId: msgResult.jobId })
                throw e
            }
            continue
        }


        // step 3: push result back to message queue
        const responseCreatedAt = Date.now()
        const responseId = Bun.hash(`response:${msgResult.jobId}`).toString()
        const responseMessageBase = {
            requestJobId: msgResult.jobId,
            name: msgResult.name,
            createdAt: responseCreatedAt,
            createdBy: groupName,
            retried: 0,
            maxRetry: msgResult.maxRetry,
            lastTriedAt: responseCreatedAt
        }

        let responseMessage: ResponseMessage
        if (serviceResult.err) {
            const errorCode = serviceResult.msg ?? 'SERVICE_ERROR'
            responseMessage = {
                ...responseMessageBase,
                result: 'error',
                error: {
                    code: errorCode,
                    message: errorCode
                }
            }
        } else {
            if (!serviceResult.payload) {
                throw 'MISSING_SERVICE_RESPONSE_PAYLOAD'
            }
            responseMessage = {
                ...responseMessageBase,
                result: 'success',
                payload: serviceResult.payload
            }
        }

        let dispatchSucceeded = false
        let dispatchRetryCount = 0
        let lastDispatchError: unknown = null

        while (dispatchRetryCount <= responseMessage.maxRetry) {
            const responseMessageFields = [
                'requestJobId', responseMessage.requestJobId,
                'name', responseMessage.name,
                'createdAt', responseMessage.createdAt.toString(),
                'createdBy', responseMessage.createdBy,
                'retried', dispatchRetryCount.toString(),
                'maxRetry', responseMessage.maxRetry.toString(),
                'lastTriedAt', Date.now().toString(),
                'result', responseMessage.result
            ]

            if (responseMessage.result === 'success') {
                responseMessageFields.push('payload', JSON.stringify(responseMessage.payload))
            } else {
                responseMessageFields.push('error', JSON.stringify(responseMessage.error))
            }

            try {
                await dispatchMessage(responseStreamKey, responseId, cacheClient, responseMessageFields)
                dispatchSucceeded = true
                console.info('Response dispatched successfully: ', { responseId, requestJobId: msgResult.jobId, retryCount: dispatchRetryCount})
                break
            }catch(dispatchError){
                lastDispatchError = dispatchError
                console.error('Response dispatch attempt failed: ', {
                    error: dispatchError,
                    responseId,
                    requestJobId: msgResult.jobId,
                    retryCount: dispatchRetryCount,
                    maxRetry: responseMessage.maxRetry
                })

                if (dispatchRetryCount >= responseMessage.maxRetry) break

                dispatchRetryCount += 1
                await Bun.sleep(500 * dispatchRetryCount)
            }
        }

        // Failed to dispatch message and retry reached maxRetry, push to DLQ and ack
        if (!dispatchSucceeded) {
            await moveToDlqAndAckSourceMessage({
                dlqStreamKey,
                sourceStreamKey: streamKey,
                sourceGroupName: groupName,
                sourceStreamMessageId: msgResult.streamMessageId,
                sourceJobId: msgResult.jobId,
                errorCode: typeof lastDispatchError === 'string' ? lastDispatchError : 'RESPONSE_DISPATCH_MAX_RETRY_REACHED'
            })

            continue
        }


        // step 4: Acknowledge Message which has been dispatched
        try {
            const ackCount = await ackMessage(streamKey, groupName, msgResult.streamMessageId)

            if (ackCount !== 1) {
                throw 'FAILED_ACK_SOURCE_MESSAGE'
            }

            console.info('Source message acked: ', {
                sourceStreamMessageId: msgResult.streamMessageId,
                requestJobId: msgResult.jobId,
                responseId
            })
        } catch (ackError) {
            console.error('Failed to ack source message: ', {
                error: ackError,
                sourceStreamMessageId: msgResult.streamMessageId,
                requestJobId: msgResult.jobId,
                responseId
            })
            throw ackError
        }
    }

    // finished while loop, should indicate explicitly
    console.log('Stopped listening message queue: ', streamKey)
}
