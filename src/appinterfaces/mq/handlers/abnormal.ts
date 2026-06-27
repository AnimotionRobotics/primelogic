/**
 * All Abnormal Situation should be Handled by functions here
 */
import type { JobMessage } from "@/commontypes/handlerType"




/**
 * Handler for failure situation of getting message from redis stream
 */
export const onGetMessageError = async () => {

    // TODO - didn't get message, log this incident


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
