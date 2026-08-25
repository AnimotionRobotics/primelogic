/**
 * App Interface: Message Queue
 * Receiving messages from message queue, processing messages with business logic by calling respective handlers
 */
import { ackMessage, connectMessageQueue, disconnectMessageQueue } from "@modules/mq"
import { createStreamGroup } from '@modules/mq'
import { allowConsuming, setAllowConsume } from '@modules/mq'
import { onGetMessage, onCallService, onDispatchResponse, onMessageQueueClose, onMessageQueueConnect } from './handlers'
import type { MessageQueueConsumerConfig } from './handlers'



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

            console.info('Source message acked: ', {
                sourceStreamMessageId: consumedJobMessage.streamMessageId,
                requestJobId: consumedJobMessage.jobId,
                responseId: responseDispatchResult.responseId
            })
        } catch (ackError) {
            console.error('Failed to ack source message: ', {
                error: ackError,
                sourceStreamMessageId: consumedJobMessage.streamMessageId,
                requestJobId: consumedJobMessage.jobId,
                responseId: responseDispatchResult.responseId
            })
            throw ackError
        }
    }

    console.log('Stopped listening message queue: ', config.streamKey)
}
