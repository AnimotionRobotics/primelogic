/**
 * All Business Logics should be accomplished by calling modules or 3rd party APIs in here
 */
import { addFileToTask, cancelTask, createTask, reviewTask, listTasks, revokeTask } from './task'
import type { HandlerResult } from './taskSupport'
import type { JobName, JobPayload, ResponseName } from '@commontypes/messageType'
import type { CancelTaskPayload, CreateTaskPayload, ReviewTaskPayload, RevokeTaskPayload, TaskResponsePayload, ListTasksPayload } from '@commontypes/taskType'


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
export type ServiceCallResult = { err: boolean, ack: boolean, msg?: string, responseName?: ResponseName, payload?: TaskResponsePayload }
export const serviceRoute = async (funcName: JobName, payload: JobPayload, requestJobId: string): Promise<ServiceCallResult> => {

    if (!funcName) {
        throw 'MISSING_PARAMETER_FUNCNAME'
    }

    if (!payload) {
        throw 'MISSING_PARAMETER_PAYLOAD'
    }

    if (!requestJobId) {
        throw 'MISSING_PARAMETER_REQUEST_JOB_ID'
    }

    if (typeof payload !== 'object') {
        throw 'INVALID_PARAMETER_PAYLOAD'
    }

    let handlerResult: HandlerResult | null = null

    // Call service according to funcName
    handlerResult = funcName === 'addFileToTask' ? await addFileToTask(payload) : handlerResult
    handlerResult = funcName === 'createTask' ? await createTask(payload as CreateTaskPayload, requestJobId) : handlerResult
    handlerResult = funcName === 'reviewTask' ? await reviewTask(payload as ReviewTaskPayload) : handlerResult
    handlerResult = funcName === 'listTasks' ? await listTasks(payload as ListTasksPayload) : handlerResult
    handlerResult = funcName === 'cancelTask' ? await cancelTask(payload as CancelTaskPayload) : handlerResult
    handlerResult = funcName === 'revokeTask' ? await revokeTask(payload as RevokeTaskPayload, requestJobId) : handlerResult

    if (!handlerResult) {
        throw 'SERVICE_FUNCTION_NOT_FOUND'
    }

    // retry + xnack ?
    if (handlerResult.res === 'fail') {
        return { err: true, ack: false, msg: handlerResult.msg }
    }

    // for abnormal case, broadcast back to upstream services. and tell message queue handler to ack this message
    if (handlerResult.res === 'error') {
        return { err: true, ack: true, msg: handlerResult.msg, responseName: 'taskOperationFailed' }
    }

    // for accomplishment case, broadcase back to upstream service, and tell message queue handler to ack this message
    return { err: false, ack: true, msg: handlerResult.msg, responseName: handlerResult.responseName, payload: handlerResult.payload }

}
