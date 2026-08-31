import { supportedJobNames } from '@commontypes/messageType'
import type { ConsumedJobMessage, JobName, JobPayload } from '@commontypes/messageType'
import { getHashAllFields } from '@modules/cache'
import type { GetMessageError, StreamMessage } from '@modules/mq'

// Load and validate the Job record for a Stream message
export const loadJobMessage = async (streamMessage: StreamMessage): Promise<ConsumedJobMessage> => {
    const { streamMessageId, jobId } = streamMessage

    let jobHashRecord: Record<string, string>
    try {
        jobHashRecord = await getHashAllFields(`jobs:${jobId}`)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            const getMessageError: GetMessageError = { code: 'JOB_MESSAGE_NOT_FOUND', streamMessageId, jobId }
            throw getMessageError
        }

        throw error
    }

    // Validate the Job record
    const createdAt = Number(jobHashRecord.createdAt)
    const retried = Number(jobHashRecord.retried)
    const maxRetry = Number(jobHashRecord.maxRetry)
    const lastTriedAt = Number(jobHashRecord.lastTriedAt)

    if (!Number.isFinite(createdAt) || !Number.isFinite(retried) || !Number.isFinite(maxRetry) || !Number.isFinite(lastTriedAt)) {
        const getMessageError: GetMessageError = { code: 'INVALID_JOB_NUMBER_FIELD', streamMessageId, jobId }
        throw getMessageError
    }

    const createdBy = jobHashRecord.createdBy
    if (typeof createdBy !== 'string' || createdBy.trim().length === 0) {
        const getMessageError: GetMessageError = { code: 'INVALID_JOB_CREATED_BY', streamMessageId, jobId }
        throw getMessageError
    }

    if (!supportedJobNames.includes(jobHashRecord.name as JobName)) {
        const getMessageError: GetMessageError = { code: 'INVALID_JOB_NAME', streamMessageId, jobId }
        throw getMessageError
    }

    let payload: JobPayload
    try {
        payload = JSON.parse(jobHashRecord.payload) as JobPayload
    } catch (error) {
        const getMessageError: GetMessageError = { code: 'INVALID_JOB_PAYLOAD', streamMessageId, jobId }
        throw getMessageError
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const getMessageError: GetMessageError = { code: 'INVALID_JOB_PAYLOAD', streamMessageId, jobId }
        throw getMessageError
    }

    return {
        streamMessageId,
        jobId,
        name: jobHashRecord.name as JobName,
        createdAt,
        createdBy,
        retried,
        maxRetry,
        lastTriedAt,
        payload
    }
}
