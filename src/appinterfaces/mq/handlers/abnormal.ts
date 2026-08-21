/**
 * All Abnormal Situation should be Handled by functions here
 */
import type { ConsumedJobMessage } from '@/commontypes/messageType'
import type { ServiceCallResult } from '@services'
import type { GetMessageError } from '@/modules/mq'

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
