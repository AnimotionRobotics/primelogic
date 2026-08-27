/**
 * App Interface: Message Queue
 * Receiving messages from message queue, processing messages with business logic by calling respective handlers
 */
import { ackMessage, connectMessageQueue, disconnectMessageQueue } from "@modules/mq"
import { createStreamGroup } from '@modules/mq'
import { allowConsuming, setAllowConsume } from '@modules/mq'
import { onGetMessage, onCallService, onDispatchResponse, onMessageQueueClose, onMessageQueueConnect } from './handlers'
import type { MessageQueueConsumerConfig } from './handlers'
import { logEvent } from '@modules/logger'



export { disconnectMessageQueue, setAllowConsume }




 /**
  * Initialize Message Queue
  */
export const initMessageQueue = async (redisConnectionString: string, config: {targetStreamKey: string, targetStreamConsumerGroup: string, listenStreamKey: string, listenStreamConsumerGroup: string}) => {

    // step 1: connect to redis server
    await connectMessageQueue(redisConnectionString, { onMessageQueueConnect, onMessageQueueClose })
    setAllowConsume(true)

    // step 2: prepare stream with consumer group
    await createStreamGroup(config.targetStreamKey, config.targetStreamConsumerGroup)
    await createStreamGroup(config.listenStreamKey, config.listenStreamConsumerGroup)
}




/**
 * Start Consuming Message Queue
 * Since it is using blocking listening, this process should be the last one of Initialize process in top level script
 */
export const initConsumingMessageQueue = async (config: MessageQueueConsumerConfig): Promise<void> => {
    console.log('Now listening message queue: ', config.streamKey)

    while (allowConsuming) {
        // step 1: get message from mq
        const messageFromMqResult = await onGetMessage(config)

        if (messageFromMqResult.nextStep === 'stop') {
            break
        }

        if (messageFromMqResult.nextStep === 'continue') {
            continue
        }

        const consumedJobMessage = messageFromMqResult.message

        // step 2: call service
        const serviceCallResult = await onCallService(consumedJobMessage, config)

        if (serviceCallResult.nextStep === 'continue') {
            continue
        }

        // step 3: push result back to mq
        const responseDispatchResult = await onDispatchResponse(consumedJobMessage, serviceCallResult.serviceResult, config)

        // step 4: ack source message after response is sent
        try {
            const ackCount = await ackMessage(config.streamKey, config.groupName, consumedJobMessage.streamMessageId)

            if (ackCount !== 1) {
                throw 'FAILED_ACK_SOURCE_MESSAGE'
            }

            logEvent('info', 'mq.source.acked', {
                sourceStreamKey: config.streamKey,
                sourceGroupName: config.groupName,
                sourceStreamMessageId: consumedJobMessage.streamMessageId,
                requestJobId: consumedJobMessage.jobId,
                jobName: consumedJobMessage.name,
                sourceAckCount: ackCount,
                responseId: responseDispatchResult.responseId
            })
        } catch (ackError) {
            logEvent('error', 'mq.source.ack_failed', {
                sourceStreamKey: config.streamKey,
                sourceGroupName: config.groupName,
                sourceStreamMessageId: consumedJobMessage.streamMessageId,
                requestJobId: consumedJobMessage.jobId,
                jobName: consumedJobMessage.name,
                responseId: responseDispatchResult.responseId,
                errorCode: typeof ackError === 'string' ? ackError : 'SOURCE_ACK_FAILED',
                errorMessage: ackError instanceof Error ? ackError.message : undefined
            })
            throw ackError
        }
    }

    console.log('Stopped listening message queue: ', config.streamKey)
}
