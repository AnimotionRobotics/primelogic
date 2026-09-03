/**
 * All Business Logics should be accomplished by calling modules or 3rd party APIs in here
 */
import { addFileToTask, cancelTask, createTask, listTasks, onServiceFunctionFailure, reviewTask, revokeTask } from './handlers'
import type { HandlerResult } from './handlers'
import type { JobName, JobPayload, ResponseName } from '@commontypes/messageType'
import type { AddFileToTaskPayload, CancelTaskPayload, CreateTaskPayload, ReviewTaskPayload, RevokeTaskPayload, TaskResponsePayload, ListTasksPayload } from '@commontypes/taskType'




/**
 * Service Functions Router
 * @returns service result telling the message queue handler whether the source message can be acknowledged
 */
export type ServiceCallResult = { err: boolean, ack: boolean, msg?: string, responseName?: ResponseName, payload?: TaskResponsePayload }
export const serviceRoute = async (funcName: JobName, payload: JobPayload, requestJobId: string): Promise<ServiceCallResult> => {

    if (!funcName) {
        return { err: true, ack: true, msg: 'MISSING_PARAMETER_FUNCNAME', responseName: 'taskOperationFailed' }
    }

    if (!payload) {
        return { err: true, ack: true, msg: 'MISSING_PARAMETER_PAYLOAD', responseName: 'taskOperationFailed' }
    }

    if (!requestJobId) {
        return { err: true, ack: true, msg: 'MISSING_PARAMETER_REQUEST_JOB_ID', responseName: 'taskOperationFailed' }
    }

    if (typeof payload !== 'object') {
        return { err: true, ack: true, msg: 'INVALID_PARAMETER_PAYLOAD', responseName: 'taskOperationFailed' }
    }

    let handlerResult: HandlerResult | null = null

    try {
        // Call service according to funcName
        handlerResult = funcName === 'addFileToTask' ? await addFileToTask(payload as AddFileToTaskPayload) : handlerResult
        handlerResult = funcName === 'createTask' ? await createTask(payload as CreateTaskPayload, requestJobId) : handlerResult
        handlerResult = funcName === 'reviewTask' ? await reviewTask(payload as ReviewTaskPayload, requestJobId) : handlerResult
        handlerResult = funcName === 'listTasks' ? await listTasks(payload as ListTasksPayload) : handlerResult
        handlerResult = funcName === 'cancelTask' ? await cancelTask(payload as CancelTaskPayload, requestJobId) : handlerResult
        handlerResult = funcName === 'revokeTask' ? await revokeTask(payload as RevokeTaskPayload, requestJobId) : handlerResult
    } catch (error) {
        handlerResult = onServiceFunctionFailure(error)
    }

    if (!handlerResult) {
        return { err: true, ack: true, msg: 'SERVICE_FUNCTION_NOT_FOUND', responseName: 'taskOperationFailed' }
    }

    // Return retryable failures without acknowledging the source message
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
