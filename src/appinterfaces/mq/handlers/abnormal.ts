/**
 * All Abnormal Situation should be Handled by functions here
 */
import type { ConsumedJobMessage } from '@commontypes/messageType'
import type { ServiceCallResult } from '@services'
import { ackMessage, appendStreamMessage, type GetMessageError } from '@modules/mq'

const dlqGetMessageErrorCodes: string[] = [
    'INVALID_STREAM_FIELDS',
    'INVALID_STREAM_FIELD',
    'MISSING_JOB_ID',
    'JOB_MESSAGE_NOT_FOUND',
    'INVALID_JOB_NUMBER_FIELD',
    'INVALID_JOB_CREATED_BY',
    'INVALID_JOB_NAME',
    'INVALID_JOB_PAYLOAD'
]
/**
 * Handler for failure situation of getting message from redis stream
 */
export const onGetMessageError = (error: unknown): error is GetMessageError => {

    // Identify whether the error can be handled by DLQ, other errors are considered as critical
    const canPushToDlq = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' &&
        'streamMessageId' in error && typeof error.streamMessageId === 'string' && dlqGetMessageErrorCodes.includes(error.code)

    return canPushToDlq
}




/**
 * Job Message imperfect
 */
export const onMaxRetryReached = async (job: ConsumedJobMessage): Promise<ServiceCallResult> => {

    // TODO - how to deal with this situation? Push to DLQ


    return { err: false, ack: true }

}




/**
 * No Service Handler Function Found
 */
export const onJobMsgNameMissing = (r): ServiceCallResult => {

     console.log(__filename, '\nAbnormal happened: ', r)
     // TODO - code logic error, should report and record to system error log
     // save hash, use key - logs:xxxxxxx, type: incident|fail|error, msg detail, service detail
     //

     return { err: false, ack: true }

}




/**
 *
 */
export const onGetJsonError = (e: string, payload: string) => {

    // TODO - handle getJson error
    // possible e: FAILED_GET_JSON
    // possible e: JSON_RESULT_EMPTY
    // possible e: JSON_RESULT_MULTI

}




export type DeadLetterParams = {
    dlqStreamKey: string,
    sourceStreamKey: string,
    sourceGroupName: string,
    sourceStreamMessageId: string,
    sourceJobId?: string,
    errorCode: string
}
// Move source message to DLQ first, then ack it and return the DLQ stream message ID
export const onDlqError = async (dlqParams: DeadLetterParams): Promise<string> => {
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
