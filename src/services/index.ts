/**
 * All Business Logics should be accomplished by calling modules or 3rd party APIs in here
 */
import { addFileToTask } from './task'
import type { HandlerResult } from '@/commontypes/handlerType'
import type { JobName, JobPayload } from '@/commontypes/messageType'
import type { TaskOperationResponsePayload } from '@commontypes/taskType'
export { addFileToTask }


type ServiceFunction = ( payload: JobPayload ) => Promise<HandlerResult>

const serviceFunctions:Partial<Record<JobName, ServiceFunction>> = { addFileToTask }

// const serviceFunctions = {
//     addFileToTask?: ServiceFunction
//     createTask?: ServiceFunction
//     reviewTask?: ServiceFunction
// }



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
export type ServiceCallResult = { err: boolean, ack: boolean, msg?: string, payload?: TaskOperationResponsePayload }
export const serviceRoute = async (funcName: JobName, payload: JobPayload): Promise<ServiceCallResult> => {


    if (!funcName) throw 'MISSING_PARAMETER_FUNCNAME'
    if (!payload) throw 'MISSING_PARAMETER_PAYLOAD'

    const serviceFunction = serviceFunctions[funcName]

    if (!serviceFunction) {
        throw 'SERVICE_FUNCTION_NOT_FOUND'
    }

    // call actual service function according to funcName
    const handlerResult = await serviceFunction(payload)

    // retry + xnack ?
    if (handlerResult.res === 'fail') {
        return { err: true, ack: false, msg: handlerResult.msg }
    }

    // for abnormal case, broadcast back to upstream services. and tell message queue handler to ack this message
    if (handlerResult.res === 'error') {
        return { err: true, ack: true, msg: handlerResult.msg }
    }

    // for accomplishment case, broadcase back to upstream service, and tell message queue handler to ack this message
    return { err: false, ack: true, msg: handlerResult.msg, payload: handlerResult.payload}

}
