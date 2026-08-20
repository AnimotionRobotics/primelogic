import { ackMessage, appendStreamMessage } from "@modules/mq"

export type DeadLetterParams = {
    dlqStreamKey: string,
    sourceStreamKey: string,
    sourceGroupName: string,
    sourceStreamMessageId: string,
    sourceJobId?: string,
    errorCode: string
}
export const moveToDlqAndAckSourceMessage = async (dlqParams: DeadLetterParams): Promise<string> => {
    const deadLetterFields = [
        'sourceStreamKey', dlqParams.sourceStreamKey,
        'sourceStreamMessageId', dlqParams.sourceStreamMessageId,
        'errorCode', dlqParams.errorCode,
        'createdAt', Date.now().toString()
    ]

    if (dlqParams.sourceJobId) {
        deadLetterFields.push('sourceJobId', dlqParams.sourceJobId)
    }

    const dlqStreamMessageId = await appendStreamMessage(dlqParams.dlqStreamKey, deadLetterFields)

    const ackCount = await ackMessage(dlqParams.sourceStreamKey, dlqParams.sourceGroupName, dlqParams.sourceStreamMessageId)

    if (ackCount !== 1) {
        throw 'FAILED_ACK_DEAD_LETTER_MESSAGE'
    }

    console.warn('Source message moved to DLQ and acked: ', {
        dlqStreamMessageId,
        sourceStreamMessageId: dlqParams.sourceStreamMessageId,
        sourceJobId: dlqParams.sourceJobId,
        errorCode: dlqParams.errorCode
    })

    return dlqStreamMessageId
}
