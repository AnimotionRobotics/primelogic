import { beforeEach, describe, expect, it, vi } from 'bun:test'
import type { ConsumedJobMessage } from '@commontypes/messageType'
import * as cacheModule from '@modules/cache'
import * as loggerModule from '@modules/logger'
import * as mqModule from '@modules/mq'
import * as serviceModule from '@services'
import * as abnormalModule from '@appinterfaces/mq/handlers/abnormal'
import { onCallService, onDispatchResponse, onGetMessage } from '@appinterfaces/mq/handlers/consumption'
import type { MessageQueueConsumerConfig } from '@appinterfaces/mq/handlers/consumption'

beforeEach(() => {
    vi.restoreAllMocks()
})

describe('onCallServiceError', () => {
    it('allows retry for a temporary service error', () => {
        expect(abnormalModule.onCallServiceError('SET_HASH_FAILED')).toBe(true)
    })

    it('does not allow retry for a business error', () => {
        expect(abnormalModule.onCallServiceError('INVALID_LEAVE_TIME_RANGE')).toBe(false)
    })
})

describe('onDispatchResponseError', () => {
    it('allows retry when the response Hash cannot be saved', () => {
        expect(abnormalModule.onDispatchResponseError(undefined, 'SET_HASH_FAILED')).toBe(true)
    })
})

describe('onGetMessage', () => {
    const config: MessageQueueConsumerConfig = {
        streamKey: 'jobs',
        groupName: 'primelogic',
        consumerName: 'primelogic-1',
        claimMinIdleTime: 1000,
        responseStreamKey: 'responses',
        dlqStreamKey: 'jobs:dlq'
    }

    const jobHashRecord: Record<string, string> = {
        name: 'createTask',
        createdAt: '100',
        createdBy: 'slack-socket',
        retried: '0',
        maxRetry: '3',
        lastTriedAt: '100',
        payload: JSON.stringify({
            taskType: 'leave',
            title: 'Annual leave',
            description: 'Family trip',
            submitterId: 'U123',
            details: {
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            }
        })
    }

    it('loads the Job record after reading its Stream reference', async () => {
        const getMessageSpy = vi.spyOn(mqModule, 'getMessage').mockResolvedValue({ streamMessageId: '1-0', jobId: 'job-1' })
        const getHashAllFieldsSpy = vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(jobHashRecord)
        vi.spyOn(loggerModule, 'logEvent').mockImplementation(() => undefined)

        const result = await onGetMessage(config)

        expect(getMessageSpy).toHaveBeenCalledWith('jobs', {
            groupName: 'primelogic',
            consumerName: 'primelogic-1',
            claimMinIdleTime: 1000
        }, 5000)
        expect(getHashAllFieldsSpy).toHaveBeenCalledWith('jobs:job-1')
        expect(result).toEqual({
            nextStep: 'callService',
            message: {
                streamMessageId: '1-0',
                jobId: 'job-1',
                name: 'createTask',
                createdAt: 100,
                createdBy: 'slack-socket',
                retried: 0,
                maxRetry: 3,
                lastTriedAt: 100,
                payload: JSON.parse(jobHashRecord.payload)
            }
        })
    })

    it('moves the source message to DLQ when the Job record does not exist', async () => {
        vi.spyOn(mqModule, 'getMessage').mockResolvedValue({ streamMessageId: '1-0', jobId: 'job-1' })
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const onDlqErrorSpy = vi.spyOn(abnormalModule, 'onDlqError').mockResolvedValue('2-0')

        const result = await onGetMessage(config)

        expect(onDlqErrorSpy).toHaveBeenCalledWith({
            dlqStreamKey: 'jobs:dlq',
            sourceStreamKey: 'jobs',
            sourceGroupName: 'primelogic',
            sourceStreamMessageId: '1-0',
            sourceJobId: 'job-1',
            errorCode: 'JOB_MESSAGE_NOT_FOUND'
        })
        expect(result).toEqual({ nextStep: 'continue' })
    })

    it('throws a temporary Cache error without moving the source message to DLQ', async () => {
        vi.spyOn(mqModule, 'getMessage').mockResolvedValue({ streamMessageId: '1-0', jobId: 'job-1' })
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('ERROR_GET_ALL_HASH_FIELDS')
        const onDlqErrorSpy = vi.spyOn(abnormalModule, 'onDlqError')

        await expect(onGetMessage(config)).rejects.toBe('ERROR_GET_ALL_HASH_FIELDS')
        expect(onDlqErrorSpy).not.toHaveBeenCalled()
    })
})

describe('onCallService', () => {
    const config: MessageQueueConsumerConfig = {
        streamKey: 'jobs',
        groupName: 'primelogic',
        consumerName: 'primelogic-1',
        claimMinIdleTime: 1000,
        responseStreamKey: 'responses',
        dlqStreamKey: 'jobs:dlq'
    }

    const message: ConsumedJobMessage = {
        streamMessageId: '1-0',
        jobId: 'job-1',
        name: 'createTask',
        createdAt: 100,
        createdBy: 'slack-socket',
        retried: 0,
        maxRetry: 3,
        lastTriedAt: 100,
        payload: {
            taskType: 'leave',
            title: 'Annual leave',
            description: 'Family trip',
            submitterId: 'U123',
            details: {
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            }
        }
    }

    it('nacks the source message when the service error can be retried', async () => {
        const retrySteps: string[] = []
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(loggerModule, 'logEvent').mockImplementation(() => undefined)
        vi.spyOn(serviceModule, 'serviceRoute').mockRejectedValue('SET_HASH_FAILED')
        const incrementHashFieldSpy = vi.spyOn(cacheModule, 'incrementHashField').mockImplementation(async () => {
            retrySteps.push('incrementRetry')
            return 1
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockImplementation(async () => {
            retrySteps.push('updateLastTriedAt')
        })
        const nAckMessageSpy = vi.spyOn(mqModule, 'nAckMessage').mockImplementation(async () => {
            retrySteps.push('nackSourceMessage')
            return true
        })

        const result = await onCallService(message, config)

        expect(incrementHashFieldSpy).toHaveBeenCalledWith('jobs:job-1', 'retried')
        expect(setHashSpy).toHaveBeenCalledWith('jobs:job-1', { lastTriedAt: '1000' })
        expect(nAckMessageSpy).toHaveBeenCalledWith('jobs', 'primelogic', 'FAIL', ['1-0'])
        expect(retrySteps).toEqual(['incrementRetry', 'updateLastTriedAt', 'nackSourceMessage'])
        expect(result).toEqual({ nextStep: 'continue' })
    })

    it('returns a failure response when the service error cannot be retried', async () => {
        vi.spyOn(loggerModule, 'logEvent').mockImplementation(() => undefined)
        vi.spyOn(serviceModule, 'serviceRoute').mockRejectedValue('INVALID_LEAVE_TIME_RANGE')
        const incrementHashFieldSpy = vi.spyOn(cacheModule, 'incrementHashField').mockResolvedValue(1)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const nAckMessageSpy = vi.spyOn(mqModule, 'nAckMessage').mockResolvedValue(true)

        const result = await onCallService(message, config)

        expect(incrementHashFieldSpy).not.toHaveBeenCalled()
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(nAckMessageSpy).not.toHaveBeenCalled()
        expect(result).toEqual({
            nextStep: 'pushResponse',
            serviceResult: {
                err: true,
                ack: true,
                msg: 'SERVICE_FUNCTION_FAILED',
                responseName: 'taskOperationFailed'
            }
        })
    })
})

describe('onDispatchResponse', () => {
    const config: MessageQueueConsumerConfig = {
        streamKey: 'jobs',
        groupName: 'primelogic',
        consumerName: 'primelogic-1',
        claimMinIdleTime: 1000,
        responseStreamKey: 'responses',
        dlqStreamKey: 'jobs:dlq'
    }

    const message: ConsumedJobMessage = {
        streamMessageId: '1-0',
        jobId: 'job-1',
        name: 'createTask',
        createdAt: 100,
        createdBy: 'slack-socket',
        retried: 0,
        maxRetry: 3,
        lastTriedAt: 100,
        payload: {
            taskType: 'leave',
            title: 'Annual leave',
            description: 'Family trip',
            submitterId: 'U123',
            details: {
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            }
        }
    }

    it('saves the response before dispatching its ID', async () => {
        const responseSteps: string[] = []
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(loggerModule, 'logEvent').mockImplementation(() => undefined)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockImplementation(async () => {
            responseSteps.push('persistResponse')
        })
        const dispatchMessageSpy = vi.spyOn(mqModule, 'dispatchMessage').mockImplementation(async () => {
            responseSteps.push('dispatchResponse')
        })
        const responseId = Bun.hash('response:job-1').toString()
        const responsePayload = {
            taskId: 'task-1',
            taskType: 'leave' as const,
            status: 'PENDING' as const,
            submitterId: 'U123',
            approverIds: ['U456'],
            observerIds: [],
            title: 'Annual leave',
            details: {
                leaveType: 'annual' as const,
                startAt: 100,
                endAt: 200
            },
            createdAt: 100,
            updatedAt: 100
        }

        const result = await onDispatchResponse(message, {
            err: false,
            ack: true,
            msg: 'TASK_CREATED',
            responseName: 'taskCreated',
            payload: responsePayload
        }, config)

        expect(setHashSpy).toHaveBeenCalledWith(`responses:${responseId}`, {
            requestJobId: 'job-1',
            name: 'taskCreated',
            createdAt: '1000',
            createdBy: 'primelogic',
            retried: '0',
            maxRetry: '3',
            lastTriedAt: '1000',
            msg: 'TASK_CREATED',
            result: 'success',
            payload: JSON.stringify(responsePayload)
        })
        expect(dispatchMessageSpy).toHaveBeenCalledWith('responses', responseId)
        expect(responseSteps).toEqual(['persistResponse', 'dispatchResponse'])
        expect(result).toEqual({ responseId })
    })
})
