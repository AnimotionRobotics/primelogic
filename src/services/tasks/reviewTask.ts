import { getHashAllFields, setHash } from '@modules/cache'
import type { ReviewTaskPayload, TaskServiceResultPayload, TaskStatus, TaskType } from '@commontypes/taskType'
import type { ResponseName } from '@commontypes/messageType'
import type { HandlerResult } from './index'

// Review a task and update it
export const reviewTask = async (payload: ReviewTaskPayload, requestJobId: string): Promise<HandlerResult> => {

    if (!payload) {
        throw 'MISSING_PARAMETER_PAYLOAD'
    }

    if (!requestJobId) {
        throw 'MISSING_PARAMETER_REQUEST_JOB_ID'
    }

    const hasRequiredReviewFields = typeof payload === 'object' && 'taskId' in payload && 'approverId' in payload && 'decision' in payload

    if (!hasRequiredReviewFields) {
        throw 'INVALID_REVIEW_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.approverId !== 'string' || payload.approverId.trim().length === 0) {
        throw 'INVALID_APPROVER_ID'
    }

    if (payload.decision !== 'approve' && payload.decision !== 'reject') {
        throw 'INVALID_REVIEW_DECISION'
    }

    // Load the task record
    let taskFields: Record<string, string>
    try {
        taskFields = await getHashAllFields(`tasks:${payload.taskId}`)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }
        throw error
    }

    // Check review permission
    if (payload.approverId !== taskFields.approverId) {
        return { res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' }
    }

    // Check whether the task has already been reviewed
    if (taskFields.status !== 'PENDING') {
        return { res: 'error', msg: 'TASK_ALREADY_REVIEWED' }
    }

    // Build the review update
    const reviewStatus: TaskStatus = payload.decision === 'approve' ? 'APPROVED' : 'REJECTED'
    const reviewedAt = Date.now()
    const updatedFields: Record<string, string> = {
        status: reviewStatus,
        updatedAt: reviewedAt.toString(),
        reviewedAt: reviewedAt.toString()
    }

    if (payload.comment !== undefined) {
        updatedFields.reviewComment = payload.comment
    }

    // Save the review result
    await setHash(`tasks:${payload.taskId}`, updatedFields)

    // Build the service response
    const taskDetails = JSON.parse(taskFields.details)
    const responseName: ResponseName = reviewStatus === 'APPROVED' ? 'taskApproved' : 'taskRejected'
    const resultMessage = reviewStatus === 'APPROVED' ? 'TASK_APPROVED' : 'TASK_REJECTED'

    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: payload.taskId,
        taskType: taskFields.taskType as TaskType,
        status: reviewStatus,

        submitterId: taskFields.submitterId,
        approverId: taskFields.approverId,
        observerId: taskFields.observerId,

        title: taskFields.title,
        details: taskDetails
    }

    if (taskFields.description !== undefined) {
        taskServiceResultPayload.description = taskFields.description
    }

    if (payload.comment !== undefined) {
        taskServiceResultPayload.reviewComment = payload.comment
    }

    return { res: 'success', msg: resultMessage, responseName, payload: taskServiceResultPayload }
}
