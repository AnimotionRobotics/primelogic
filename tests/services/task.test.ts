import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import { addFileToTask, createTask, reviewTask, updateTask } from '@services/task'
import type { AddFileToTaskPayload, CreateTaskPayload, ReviewTaskPayload, UpdateTaskPayload } from '@commontypes/taskType'

beforeEach(() => {
    vi.restoreAllMocks()
})


describe('addFileToTask', () => {
    const addFilePayload: AddFileToTaskPayload = {
        metadata: '{}',
        userId: 'user-1',
        selectedValues: ['task-1', 'task-2'],
        fileId: 'file-1'
    }

    it('returns success when all selected tasks exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockResolvedValueOnce({ taskId: 'task-1' })
            .mockResolvedValueOnce({ taskId: 'task-2' })

        const result = await addFileToTask(addFilePayload)

        expect(result).toEqual({
            res: 'success',
            msg: 'successfully added file to 2 tasks',
            responseName: 'fileAddedToTask',
            payload: {
                fileId: 'file-1',
                taskIds: ['task-1', 'task-2']
            }
        })
    })

    it('returns an error when no selected task exists', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockRejectedValueOnce('NO_RECORD_FOUND')
            .mockRejectedValueOnce('NO_RECORD_FOUND')

        const result = await addFileToTask(addFilePayload)

        expect(result).toEqual({ res: 'error', msg: 'NO_TASK_FOUND' })
    })

    it('returns an error when some selected tasks do not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockResolvedValueOnce({ taskId: 'task-1' })
            .mockRejectedValueOnce('NO_RECORD_FOUND')

        const result = await addFileToTask(addFilePayload)

        expect(result).toEqual({ res: 'error', msg: 'NOT_FOUND:task-2' })
    })

    it('throws when metadata is invalid JSON', async () => {
        const invalidPayload: AddFileToTaskPayload = {
            ...addFilePayload,
            metadata: 'invalid JSON'
        }

        await expect(addFileToTask(invalidPayload)).rejects.toThrow()
    })
})




describe('createTask', () => {
    const createTaskPayload: CreateTaskPayload = {
        taskType: 'leave',
        title: 'Annual leave',
        description: 'Family trip',
        submitterId: 'U0AMWQX3CQG',
        details: {
            leaveType: 'annual',
            startAt: 100,
            endAt: 200
        }
    }

    const existingTaskFields: Record<string, string> = {
        taskId: 'existing-task-id',
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverId: 'U0BJR2NMZ6D',
        observerId: 'U0BJR2NMZ6D',
        title: 'Annual leave',
        description: 'Family trip',
        details: JSON.stringify(createTaskPayload.details),
        createdAt: '100',
        updatedAt: '100'
    }

    it('creates and saves a new task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const taskId = Bun.hash('task:create-job-1').toString()

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(setHashSpy).toHaveBeenCalledWith(`tasks:${taskId}`, {
            taskId,
            taskType: 'leave',
            status: 'PENDING',
            sourceJobId: 'create-job-1',
            submitterId: 'U0AMWQX3CQG',
            approverId: 'U0BJR2NMZ6D',
            observerId: 'U0BJR2NMZ6D',
            title: 'Annual leave',
            description: 'Family trip',
            details: JSON.stringify(createTaskPayload.details),
            createdAt: '1000',
            updatedAt: '1000'
        })
        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_CREATED',
            responseName: 'taskCreated',
            payload: {
                taskId,
                taskType: 'leave',
                status: 'PENDING',
                submitterId: 'U0AMWQX3CQG',
                approverId: 'U0BJR2NMZ6D',
                observerId: 'U0BJR2NMZ6D',
                title: 'Annual leave',
                description: 'Family trip',
                details: createTaskPayload.details
            }
        })
    })

    it('returns the saved task for the same request', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(existingTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_CREATED',
            responseName: 'taskCreated',
            payload: {
                taskId: 'existing-task-id',
                taskType: 'leave',
                status: 'PENDING',
                submitterId: 'U0AMWQX3CQG',
                approverId: 'U0BJR2NMZ6D',
                observerId: 'U0BJR2NMZ6D',
                title: 'Annual leave',
                description: 'Family trip',
                details: createTaskPayload.details
            }
        })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the saved task belongs to another request', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...existingTaskFields,
            sourceJobId: 'create-job-2'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ALREADY_EXISTS' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when no task assignment exists', async () => {
        const getHashSpy = vi.spyOn(cacheModule, 'getHashAllFields')

        const result = await createTask({
            ...createTaskPayload,
            submitterId: 'unknown-user'
        }, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(getHashSpy).not.toHaveBeenCalled()
    })

    it('throws when the leave time range is invalid', async () => {
        const invalidPayload: CreateTaskPayload = {
            ...createTaskPayload,
            details: {
                ...createTaskPayload.details,
                endAt: 100
            }
        }

        await expect(createTask(invalidPayload, 'create-job-1')).rejects.toBe('INVALID_LEAVE_TIME_RANGE')
    })
})




describe('reviewTask', () => {
    const reviewTaskPayload: ReviewTaskPayload = {
        taskId: 'task-1',
        approverId: 'U0BJR2NMZ6D',
        decision: 'approve',
        comment: 'Approved'
    }

    const pendingTaskFields: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverId: 'U0BJR2NMZ6D',
        observerId: 'U0BJR2NMZ6D',
        title: 'Annual leave',
        description: 'Family trip',
        details: JSON.stringify({
            leaveType: 'annual',
            startAt: 100,
            endAt: 200
        }),
        createdAt: '100',
        updatedAt: '100'
    }

    it('approves and saves a pending task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload)

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'APPROVED',
            updatedAt: '1000',
            reviewedAt: '1000',
            reviewComment: 'Approved'
        })
        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_APPROVED',
            responseName: 'taskApproved',
            payload: {
                taskId: 'task-1',
                taskType: 'leave',
                status: 'APPROVED',
                submitterId: 'U0AMWQX3CQG',
                approverId: 'U0BJR2NMZ6D',
                observerId: 'U0BJR2NMZ6D',
                title: 'Annual leave',
                description: 'Family trip',
                details: {
                    leaveType: 'annual',
                    startAt: 100,
                    endAt: 200
                },
                reviewComment: 'Approved'
            }
        })
    })

    it('rejects and saves a pending task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const rejectPayload: ReviewTaskPayload = {
            ...reviewTaskPayload,
            decision: 'reject',
            comment: 'Insufficient balance'
        }

        const result = await reviewTask(rejectPayload)

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'REJECTED',
            updatedAt: '1000',
            reviewedAt: '1000',
            reviewComment: 'Insufficient balance'
        })
        expect(result.msg).toBe('TASK_REJECTED')
        expect(result.responseName).toBe('taskRejected')
        expect(result.payload).toEqual(expect.objectContaining({ status: 'REJECTED' }))
    })

    it('returns an error when the approver does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask({
            ...reviewTaskPayload,
            approverId: 'another-approver'
        })

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task was already reviewed', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskFields,
            status: 'APPROVED'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload)

        expect(result).toEqual({ res: 'error', msg: 'TASK_ALREADY_REVIEWED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload)

        expect(result).toEqual({ res: 'error', msg: 'TASK_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })
})




describe('updateTask', () => {
    const updateTaskPayload: UpdateTaskPayload = {
        taskId: 'task-1',
        submitterId: 'U0AMWQX3CQG',
        title: 'Updated annual leave',
        description: 'Updated family trip',
        details: {
            leaveType: 'personal',
            startAt: 300,
            endAt: 400
        }
    }

    const approvedTaskFields: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'APPROVED',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverId: 'U0BJR2NMZ6D',
        observerId: 'U0BJR2NMZ6D',
        title: 'Annual leave',
        description: 'Family trip',
        details: JSON.stringify({
            leaveType: 'annual',
            startAt: 100,
            endAt: 200
        }),
        createdAt: '100',
        updatedAt: '200',
        reviewedAt: '200',
        reviewComment: 'Approved'
    }

    it('updates an approved task and resets it to pending', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(approvedTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const deleteHashFieldsSpy = vi.spyOn(cacheModule, 'deleteHashFields').mockResolvedValue(undefined)

        const result = await updateTask(updateTaskPayload)

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'PENDING',
            title: 'Updated annual leave',
            description: 'Updated family trip',
            details: JSON.stringify(updateTaskPayload.details),
            updatedAt: '1000'
        })
        expect(deleteHashFieldsSpy).toHaveBeenCalledWith('tasks:task-1', ['reviewedAt', 'reviewComment'])
        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_UPDATED',
            responseName: 'taskUpdated',
            payload: {
                taskId: 'task-1',
                taskType: 'leave',
                status: 'PENDING',
                submitterId: 'U0AMWQX3CQG',
                approverId: 'U0BJR2NMZ6D',
                observerId: 'U0BJR2NMZ6D',
                title: 'Updated annual leave',
                description: 'Updated family trip',
                details: updateTaskPayload.details
            }
        })
    })

    it('preserves the description when it is omitted from a rejected task update', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskFields,
            status: 'REJECTED'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        vi.spyOn(cacheModule, 'deleteHashFields').mockResolvedValue(undefined)
        const payloadWithoutDescription: UpdateTaskPayload = {
            taskId: updateTaskPayload.taskId,
            submitterId: updateTaskPayload.submitterId,
            title: updateTaskPayload.title,
            details: updateTaskPayload.details
        }

        const result = await updateTask(payloadWithoutDescription)

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', expect.not.objectContaining({
            description: expect.anything()
        }))
        expect(result.payload).toEqual(expect.objectContaining({
            status: 'PENDING',
            description: 'Family trip'
        }))
    })

    it('returns an error when the submitter does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(approvedTaskFields)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const deleteHashFieldsSpy = vi.spyOn(cacheModule, 'deleteHashFields').mockResolvedValue(undefined)

        const result = await updateTask({
            ...updateTaskPayload,
            submitterId: 'another-submitter'
        })

        expect(result).toEqual({ res: 'error', msg: 'TASK_UPDATE_FORBIDDEN' })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(deleteHashFieldsSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const deleteHashFieldsSpy = vi.spyOn(cacheModule, 'deleteHashFields').mockResolvedValue(undefined)

        const result = await updateTask(updateTaskPayload)

        expect(result).toEqual({ res: 'error', msg: 'TASK_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(deleteHashFieldsSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the stored task ID does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskFields,
            taskId: 'another-task'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const deleteHashFieldsSpy = vi.spyOn(cacheModule, 'deleteHashFields').mockResolvedValue(undefined)

        const result = await updateTask(updateTaskPayload)

        expect(result).toEqual({ res: 'error', msg: 'TASK_ID_MISMATCH' })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(deleteHashFieldsSpy).not.toHaveBeenCalled()
    })
})
