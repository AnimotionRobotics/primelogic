/**
 * All Business Logics should be accomplished by calling modules or 3rd party APIs in here
 */
import { addFileToTask } from './task';
export { addFileToTask }

const serviceFunctions = { addFileToTask }





/**
 * Service Abnormal Situation Handler
 * e.g: normal handler function threw error
 */
export const onServiceFunctionFailure = (data: object) => {

    // TODO - implement the final logic of errors thrown by all service handler functions
    //
    console.log('\n\n', __filename, '\nonServiceFunctionFailure(), data: ', data)
}




/**
 * Service Functions Router
 * @returns boolean telling message queue handler if the message is properly handled, letting it know should perform ack or nack
 */
export type ServiceCallResult = { err: boolean, ack: boolean, msg?: string }
export const serviceRoute = async (funcName: string, data: any): Promise<ServiceResult> => {


    if (!funcName) throw 'MISSING_PARAMETER_FUNCNAME'
    if (!data) throw 'MISSING_PARAMETER_DATA'
    
    // call actual service function according to funcName
    let serviceResult
    try {
        serviceResult = await serviceFunctions[funcName](data)
    } catch(e) {
        console.log('\n', __filename, ' call serviceFunctions(), e: ', e)
        // TODO - according to error message return true or false to let message queue handler ack or nack
    }
    
    const { res, msg, next } = serviceResult
    //
    console.log('res, ', ' msg: ', msg, ' next: ', next)

    //
    

    // for abnormal case, broadcast back to upstream services. and tell message queue handler to ack this message
    if ( res === 'error' ) {
        return { err: true, ack: true, msg }
    }


    // for accomplishment case, broadcase back to upstream service, and tell message queue handler to ack this message
    return { err: false, ack: true, msg }


}
