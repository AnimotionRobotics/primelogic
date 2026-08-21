import type { ConsumedJobMessage } from '@commontypes/messageType'
import { getMessage } from '@modules/mq'
import { onGetMessageError } from './abnormal'
import { moveToDlqAndAckSourceMessage } from './moveToDlqAndAck'

export type MessageQueueConsumerConfig = {
    streamKey: string
    groupName: string
    consumerName: string
    claimMinIdleTime: number
    responseStreamKey: string
    dlqStreamKey: string
}

export type GetMessageFromMqResult =
    | { nextStep: 'callService', message: ConsumedJobMessage }
    | { nextStep: 'continue' }
    | { nextStep: 'stop' }

// Get one message and return next step
export const getMessageFromMq = async (config: MessageQueueConsumerConfig): Promise<GetMessageFromMqResult> => {
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
        await moveToDlqAndAckSourceMessage({
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
