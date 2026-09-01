import { getHashAllFields, getHashField, incrementHashField, setHash } from './cache'
import { supportedTaskHistoryActions, supportedTaskStatuses, supportedTaskTypes } from '@commontypes/taskType'
import type { AppendTaskHistoryInput, TaskHistoryAction, TaskHistoryRecord, TaskStatus, TaskType } from '@commontypes/taskType'

// Add a task history record
export const appendTaskHistory = async (taskId: string, taskHistoryInput: AppendTaskHistoryInput): Promise<void> => {
    if (!taskId || typeof taskId !== 'string') throw 'INVALID_TASK_HISTORY_TASK_ID'
    if (!taskHistoryInput || typeof taskHistoryInput !== 'object') throw 'INVALID_TASK_HISTORY_RECORD'
    if (!taskHistoryInput.requestJobId || typeof taskHistoryInput.requestJobId !== 'string') throw 'INVALID_TASK_HISTORY_REQUEST_JOB_ID'
    if (!supportedTaskHistoryActions.includes(taskHistoryInput.action)) throw 'INVALID_TASK_HISTORY_ACTION'
    if (!taskHistoryInput.operatorId || typeof taskHistoryInput.operatorId !== 'string') throw 'INVALID_TASK_HISTORY_OPERATOR_ID'
    if (!supportedTaskStatuses.includes(taskHistoryInput.currentStatus)) throw 'INVALID_TASK_HISTORY_STATUS'
    if (!Number.isFinite(taskHistoryInput.createdAt)) throw 'INVALID_TASK_HISTORY_CREATED_AT'
    if (taskHistoryInput.comment !== undefined && typeof taskHistoryInput.comment !== 'string') throw 'INVALID_TASK_HISTORY_COMMENT'
    if (taskHistoryInput.action === 'CREATED' && taskHistoryInput.currentStatus !== 'PENDING') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'CANCELLED' && taskHistoryInput.currentStatus !== 'CANCELLED') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'CREATION_APPROVED' && taskHistoryInput.currentStatus !== 'APPROVED') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'CREATION_REJECTED' && taskHistoryInput.currentStatus !== 'REJECTED') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'REVOCATION_REQUESTED' && taskHistoryInput.currentStatus !== 'WAITING_REVOKE') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'REVOCATION_APPROVED' && taskHistoryInput.currentStatus !== 'REVOKED') throw 'INVALID_TASK_HISTORY_STATUS'
    if (taskHistoryInput.action === 'REVOCATION_REJECTED' && taskHistoryInput.currentStatus !== 'APPROVED') throw 'INVALID_TASK_HISTORY_STATUS'

    if (taskHistoryInput.action === 'CREATED') {
        if (!supportedTaskTypes.includes(taskHistoryInput.taskType)) throw 'INVALID_TASK_HISTORY_TASK_TYPE'
        if (!taskHistoryInput.submitterId || typeof taskHistoryInput.submitterId !== 'string') throw 'INVALID_TASK_HISTORY_SUBMITTER_ID'
        if (!taskHistoryInput.submitterName || typeof taskHistoryInput.submitterName !== 'string') throw 'INVALID_TASK_HISTORY_SUBMITTER_NAME'
        if (!Array.isArray(taskHistoryInput.approverIds) || !Array.isArray(taskHistoryInput.observerIds)) throw 'INVALID_TASK_HISTORY_ASSIGNMENT'
        if (!taskHistoryInput.title || typeof taskHistoryInput.title !== 'string') throw 'INVALID_TASK_HISTORY_TITLE'
        if (taskHistoryInput.description !== undefined && typeof taskHistoryInput.description !== 'string') throw 'INVALID_TASK_HISTORY_DESCRIPTION'
        if (!taskHistoryInput.details || typeof taskHistoryInput.details !== 'object') throw 'INVALID_TASK_HISTORY_DETAILS'
    }

    // Cache fields
    // lastSequence: sequence counter
    // request:<requestJobId>: task history record
    const taskHistoryKey = `tasks:history:${taskId}`
    const taskHistoryFieldName = `request:${taskHistoryInput.requestJobId}`
    const savedTaskHistoryRecord = await getHashField(taskHistoryKey, taskHistoryFieldName)

    if (savedTaskHistoryRecord !== null) return

    const sequence = await incrementHashField(taskHistoryKey, 'lastSequence')
    const taskHistoryRecord: TaskHistoryRecord = {
        ...taskHistoryInput,
        sequence
    }

    await setHash(taskHistoryKey, {
        [taskHistoryFieldName]: JSON.stringify(taskHistoryRecord)
    })
}

// Get task history records
export const getTaskHistory = async (taskId: string): Promise<TaskHistoryRecord[]> => {
    if (!taskId || typeof taskId !== 'string') throw 'INVALID_TASK_HISTORY_TASK_ID'

    let taskHistoryHashRecord: Record<string, string>
    try {
        taskHistoryHashRecord = await getHashAllFields(`tasks:history:${taskId}`)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') return []
        throw error
    }

    const taskHistoryRecords: TaskHistoryRecord[] = []

    for (const [fieldName, taskHistoryJson] of Object.entries(taskHistoryHashRecord)) {
        if (fieldName === 'lastSequence') continue

        let taskHistoryRecord: unknown
        try {
            taskHistoryRecord = JSON.parse(taskHistoryJson)
        } catch (error) {
            throw 'INVALID_TASK_HISTORY_RECORD'
        }

        if (!taskHistoryRecord || typeof taskHistoryRecord !== 'object') throw 'INVALID_TASK_HISTORY_RECORD'

        const taskHistoryValues = taskHistoryRecord as Record<string, unknown>

        if (!Number.isInteger(taskHistoryValues.sequence) || typeof taskHistoryValues.sequence !== 'number' || taskHistoryValues.sequence <= 0) throw 'INVALID_TASK_HISTORY_RECORD'
        if (typeof taskHistoryValues.requestJobId !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
        if (typeof taskHistoryValues.action !== 'string' || !supportedTaskHistoryActions.includes(taskHistoryValues.action as TaskHistoryAction)) throw 'INVALID_TASK_HISTORY_RECORD'
        if (typeof taskHistoryValues.operatorId !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
        if (typeof taskHistoryValues.currentStatus !== 'string' || !supportedTaskStatuses.includes(taskHistoryValues.currentStatus as TaskStatus)) throw 'INVALID_TASK_HISTORY_RECORD'
        if (!Number.isFinite(taskHistoryValues.createdAt) || typeof taskHistoryValues.createdAt !== 'number') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.comment !== undefined && typeof taskHistoryValues.comment !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'CREATED' && taskHistoryValues.currentStatus !== 'PENDING') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'CANCELLED' && taskHistoryValues.currentStatus !== 'CANCELLED') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'CREATION_APPROVED' && taskHistoryValues.currentStatus !== 'APPROVED') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'CREATION_REJECTED' && taskHistoryValues.currentStatus !== 'REJECTED') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'REVOCATION_REQUESTED' && taskHistoryValues.currentStatus !== 'WAITING_REVOKE') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'REVOCATION_APPROVED' && taskHistoryValues.currentStatus !== 'REVOKED') throw 'INVALID_TASK_HISTORY_RECORD'
        if (taskHistoryValues.action === 'REVOCATION_REJECTED' && taskHistoryValues.currentStatus !== 'APPROVED') throw 'INVALID_TASK_HISTORY_RECORD'

        if (taskHistoryValues.action === 'CREATED') {
            if (typeof taskHistoryValues.taskType !== 'string' || !supportedTaskTypes.includes(taskHistoryValues.taskType as TaskType)) throw 'INVALID_TASK_HISTORY_RECORD'
            if (typeof taskHistoryValues.submitterId !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
            if (typeof taskHistoryValues.submitterName !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
            if (!Array.isArray(taskHistoryValues.approverIds) || !Array.isArray(taskHistoryValues.observerIds)) throw 'INVALID_TASK_HISTORY_RECORD'
            if (typeof taskHistoryValues.title !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
            if (taskHistoryValues.description !== undefined && typeof taskHistoryValues.description !== 'string') throw 'INVALID_TASK_HISTORY_RECORD'
            if (!taskHistoryValues.details || typeof taskHistoryValues.details !== 'object') throw 'INVALID_TASK_HISTORY_RECORD'
        }

        taskHistoryRecords.push(taskHistoryRecord as TaskHistoryRecord)
    }

    return taskHistoryRecords.sort((left, right) => left.sequence - right.sequence)
}
