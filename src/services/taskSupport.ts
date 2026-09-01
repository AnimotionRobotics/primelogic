import type { ResponseName } from '@commontypes/messageType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import { supportedTaskStatuses, supportedTaskTypes } from '@commontypes/taskType'
import type { ListTasksPayload, TaskDetails, TaskRecord, TaskResponsePayload, TaskServiceResultPayload, TaskStatus, TaskType } from '@commontypes/taskType'




// Share the task service result type
export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    responseName?: ResponseName,
    payload?: TaskResponsePayload,
    next?: 'retry' | 'notify'
}


export type TaskDetailsValidator = (details: TaskDetails) => void


// Check leave task details
export const validateLeaveTaskDetails = (details: TaskDetails): void => {

    if (!('leaveType' in details) || !supportedLeaveTypes.includes(details.leaveType)) {
        throw 'INVALID_LEAVE_TYPE'
    }

    const hasValidStartAt = 'startAt' in details && typeof details.startAt === 'number' && Number.isFinite(details.startAt)
    const hasValidEndAt = 'endAt' in details && typeof details.endAt === 'number' && Number.isFinite(details.endAt)

    if (!hasValidStartAt || !hasValidEndAt) {
        throw 'INVALID_LEAVE_TIME'
    }

    if (details.startAt >= details.endAt) {
        throw 'INVALID_LEAVE_TIME_RANGE'
    }
}


// Validate supported task list filters and time ranges
export const validateListTasksPayload = (payload: ListTasksPayload): void => {
    const hasSubmitterId = payload.submitterId !== undefined
    const hasApproverId = payload.approverId !== undefined
    const hasObserverId = payload.observerId !== undefined

    if ([hasSubmitterId, hasApproverId, hasObserverId].filter(Boolean).length !== 1) {
        throw 'INVALID_LIST_TASKS_USER'
    }

    if (payload.submitterId !== undefined && (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_SUBMITTER_ID'
    }

    if (payload.approverId !== undefined && (typeof payload.approverId !== 'string' || payload.approverId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_APPROVER_ID'
    }

    if (payload.observerId !== undefined && (typeof payload.observerId !== 'string' || payload.observerId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_OBSERVER_ID'
    }

    if (payload.taskId !== undefined && (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_TASK_ID'
    }

    if (payload.taskType !== undefined && !supportedTaskTypes.includes(payload.taskType)) {
        throw 'INVALID_LIST_TASKS_TASK_TYPE'
    }

    if (payload.status !== undefined && !supportedTaskStatuses.includes(payload.status)) {
        throw 'INVALID_LIST_TASKS_STATUS'
    }

    if (payload.leaveType !== undefined && payload.taskType !== 'leave') {
        throw 'INVALID_LIST_TASKS_LEAVE_TYPE_FILTER'
    }

    if (payload.leaveType !== undefined && !supportedLeaveTypes.includes(payload.leaveType)) {
        throw 'INVALID_LIST_TASKS_LEAVE_TYPE'
    }

    if (payload.createdAtFrom !== undefined && !Number.isFinite(payload.createdAtFrom)) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_FROM'
    }

    if (payload.createdAtTo !== undefined && !Number.isFinite(payload.createdAtTo)) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_TO'
    }

    if (payload.createdAtFrom !== undefined && payload.createdAtTo !== undefined && payload.createdAtFrom > payload.createdAtTo) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_RANGE'
    }

    if (payload.reviewedAtFrom !== undefined && !Number.isFinite(payload.reviewedAtFrom)) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_FROM'
    }

    if (payload.reviewedAtTo !== undefined && !Number.isFinite(payload.reviewedAtTo)) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_TO'
    }

    if (payload.reviewedAtFrom !== undefined && payload.reviewedAtTo !== undefined && payload.reviewedAtFrom > payload.reviewedAtTo) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_RANGE'
    }
}


// Check whether a task record matches the requested list filters
export const matchesListTaskFilters = (taskRecord: TaskRecord, payload: ListTasksPayload): boolean => {
    if (payload.taskType !== undefined && taskRecord.taskType !== payload.taskType) {
        return false
    }

    if (payload.status !== undefined && taskRecord.status !== payload.status) {
        return false
    }

    if (payload.leaveType !== undefined && taskRecord.taskType === 'leave' && taskRecord.details.leaveType !== payload.leaveType) {
        return false
    }

    if (payload.createdAtFrom !== undefined && taskRecord.createdAt < payload.createdAtFrom) {
        return false
    }

    if (payload.createdAtTo !== undefined && taskRecord.createdAt > payload.createdAtTo) {
        return false
    }

    if (payload.reviewedAtFrom !== undefined && (taskRecord.reviewedAt === undefined || taskRecord.reviewedAt < payload.reviewedAtFrom)) {
        return false
    }

    if (payload.reviewedAtTo !== undefined && (taskRecord.reviewedAt === undefined || taskRecord.reviewedAt > payload.reviewedAtTo)) {
        return false
    }

    return true
}


// Convert a saved Redis Hash record back to a task record
export const parseTaskHashRecord = (taskHashRecord: Record<string, string>): TaskRecord => {
    const taskRecord: TaskRecord = {
        taskId: taskHashRecord.taskId,
        taskType: taskHashRecord.taskType as TaskType,
        status: taskHashRecord.status as TaskStatus,

        sourceJobId: taskHashRecord.sourceJobId,

        submitterId: taskHashRecord.submitterId,
        submitterName: taskHashRecord.submitterName,
        approverIds: JSON.parse(taskHashRecord.approverIds) as string[],
        observerIds: JSON.parse(taskHashRecord.observerIds) as string[],

        title: taskHashRecord.title,
        details: JSON.parse(taskHashRecord.details) as TaskDetails,

        createdAt: Number(taskHashRecord.createdAt),
        updatedAt: Number(taskHashRecord.updatedAt)
    }

    if (taskHashRecord.description !== undefined) {
        taskRecord.description = taskHashRecord.description
    }

    if (taskHashRecord.reviewedAt !== undefined) {
        taskRecord.reviewedAt = Number(taskHashRecord.reviewedAt)
    }

    if (taskHashRecord.reviewComment !== undefined) {
        taskRecord.reviewComment = taskHashRecord.reviewComment
    }

    if (taskHashRecord.pendingRevokeRequestId) {
        taskRecord.pendingRevokeRequestId = taskHashRecord.pendingRevokeRequestId
    }

    if (taskHashRecord.cancelledAt !== undefined) {
        taskRecord.cancelledAt = Number(taskHashRecord.cancelledAt)
    }

    if (taskHashRecord.cancelledReason !== undefined) {
        taskRecord.cancelledReason = taskHashRecord.cancelledReason
    }

    if (taskHashRecord.revokedAt !== undefined) {
        taskRecord.revokedAt = Number(taskHashRecord.revokedAt)
    }

    if (taskHashRecord.revokeReason) {
        taskRecord.revokeReason = taskHashRecord.revokeReason
    }

    if (taskHashRecord.revokeComment) {
        taskRecord.revokeComment = taskHashRecord.revokeComment
    }

    return taskRecord
}


// Build the payload returned by task service methods
export const buildTaskServiceResultPayload = (taskRecord: TaskRecord): TaskServiceResultPayload => {
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        submitterId: taskRecord.submitterId,
        submitterName: taskRecord.submitterName,
        approverIds: taskRecord.approverIds,
        observerIds: taskRecord.observerIds,

        title: taskRecord.title,
        details: taskRecord.details,

        createdAt: taskRecord.createdAt,
        updatedAt: taskRecord.updatedAt
    }

    if (taskRecord.description !== undefined) {
        taskServiceResultPayload.description = taskRecord.description
    }

    if (taskRecord.reviewedAt !== undefined) {
        taskServiceResultPayload.reviewedAt = taskRecord.reviewedAt
    }

    if (taskRecord.reviewComment !== undefined) {
        taskServiceResultPayload.reviewComment = taskRecord.reviewComment
    }

    if (taskRecord.pendingRevokeRequestId !== undefined) {
        taskServiceResultPayload.pendingRevokeRequestId = taskRecord.pendingRevokeRequestId
    }

    if (taskRecord.cancelledAt !== undefined) {
        taskServiceResultPayload.cancelledAt = taskRecord.cancelledAt
    }

    if (taskRecord.cancelledReason !== undefined) {
        taskServiceResultPayload.cancelledReason = taskRecord.cancelledReason
    }

    if (taskRecord.revokedAt !== undefined) {
        taskServiceResultPayload.revokedAt = taskRecord.revokedAt
    }

    if (taskRecord.revokeReason !== undefined) {
        taskServiceResultPayload.revokeReason = taskRecord.revokeReason
    }

    if (taskRecord.revokeComment !== undefined) {
        taskServiceResultPayload.revokeComment = taskRecord.revokeComment
    }

    return taskServiceResultPayload
}
