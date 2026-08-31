import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import { appendTaskHistory, getTaskHistory } from '@modules/taskHistory'
import type { AppendTaskHistoryInput, TaskHistoryRecord } from '@commontypes/taskType'

beforeEach(() => {
    vi.restoreAllMocks()
})

describe('taskHistory', () => {
    const createdTaskHistoryInput: AppendTaskHistoryInput = {
        requestJobId: 'create-job-1',
        action: 'CREATED',
        operatorId: 'U_SUBMITTER',
        currentStatus: 'PENDING',
        createdAt: 100,
        taskType: 'leave',
        submitterId: 'U_SUBMITTER',
        approverIds: ['U_APPROVER'],
        observerIds: ['U_OBSERVER'],
        title: 'Annual leave',
        description: 'Family trip',
        details: {
            leaveType: 'annual',
            startAt: 100,
            endAt: 200
        }
    }

    it('appends a history record with the next task-local sequence', async () => {
        vi.spyOn(cacheModule, 'getHashField').mockResolvedValue(null)
        vi.spyOn(cacheModule, 'incrementHashField').mockResolvedValue(1)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await appendTaskHistory('task-1', createdTaskHistoryInput)

        expect(setHashSpy).toHaveBeenCalledWith('tasks:history:task-1', {
            'request:create-job-1': JSON.stringify({
                ...createdTaskHistoryInput,
                sequence: 1
            })
        })
    })

    it('does not append the same request twice', async () => {
        vi.spyOn(cacheModule, 'getHashField').mockResolvedValue(JSON.stringify({
            ...createdTaskHistoryInput,
            sequence: 1
        }))
        const incrementHashFieldSpy = vi.spyOn(cacheModule, 'incrementHashField').mockResolvedValue(2)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await appendTaskHistory('task-1', createdTaskHistoryInput)

        expect(incrementHashFieldSpy).not.toHaveBeenCalled()
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('rejects an action whose status cannot result from that action', async () => {
        await expect(appendTaskHistory('task-1', {
            ...createdTaskHistoryInput,
            currentStatus: 'APPROVED'
        })).rejects.toBe('INVALID_TASK_HISTORY_STATUS')
    })

    it('loads history records by sequence', async () => {
        const creationRecord: TaskHistoryRecord = {
            ...createdTaskHistoryInput,
            sequence: 1
        }
        const approvalRecord: TaskHistoryRecord = {
            sequence: 2,
            requestJobId: 'review-job-1',
            action: 'CREATION_APPROVED',
            operatorId: 'U_APPROVER',
            currentStatus: 'APPROVED',
            comment: 'Approved',
            createdAt: 200
        }
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            lastSequence: '2',
            'request:review-job-1': JSON.stringify(approvalRecord),
            'request:create-job-1': JSON.stringify(creationRecord)
        })

        const result = await getTaskHistory('task-1')

        expect(result).toEqual([creationRecord, approvalRecord])
    })

    it('returns an empty list when no history record exists', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')

        const result = await getTaskHistory('task-1')

        expect(result).toEqual([])
    })
})
