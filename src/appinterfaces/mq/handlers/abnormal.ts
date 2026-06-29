/**
 * All Abnormal Situation should be Handled by functions here
 */
import type { JobMessage } from "@modules/mq"




/**
 * Handler for failure situation of getting message from redis stream
 * @returns boolean: is critical or not
 */
export const onGetMessageError = (e: string, streamKey: string, groupName: string, consumerName): boolean => {

    let isCritical = false

    // TODO - didn't get message, log this incident
    // possible value of e:
    // ERROR_WHEN_GETMESSAGE
    // INVALID_MESSAGE_ID
    // ERROR_GET_QUEUE_ITEM
    // ERROR_WHEN_HGETALL_BY_KEY

    console.error('Error getting message:', e)

    return isCritical
}




/**
 * Job Message imperfect
 */
export const onMaxRetryReached = async (job: JobMessage) => {

    // TODO - how to deal with this siutation? Push to DLQ

}




/**
 * No Service Handler Function Found
 */
 export const onJobMsgFuncMissing = (r) => {

     console.log(__filename, '\nAbnormal happened: ', r)
     // TODO - how to deal with it ?
     //

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
