import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import * as organizationModule from '@modules/organization'
import * as taskHistoryModule from '@modules/taskHistory'
import { addFileToTask, cancelTask, createTask, listTasks, reviewTask, revokeTask } from '@services/task'
import { buildTaskServiceResultPayload, parseTaskHashRecord } from '@services/taskSupport'
import type { AddFileToTaskPayload, CancelTaskPayload, CreateTaskPayload, ListTasksPayload, ReviewTaskPayload, RevokeTaskPayload, TaskRecord } from '@commontypes/taskType'

beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(taskHistoryModule, 'appendTaskHistory').mockResolvedValue(undefined)
})


describe('taskRecord', () => {
    it('parses Redis Hash fields and builds a task service payload', () => {
        const taskHashRecord: Record<string, string> = {
            taskId: 'task-1',
            taskType: 'leave',
            status: 'APPROVED',
            sourceJobId: 'create-job-1',
            submitterId: 'submitter-1',
            approverIds: JSON.stringify(['approver-1']),
            observerIds: JSON.stringify(['observer-1']),
            title: 'Annual leave',
            description: 'Family trip',
            details: JSON.stringify({
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            }),
            createdAt: '100',
            updatedAt: '300',
            reviewedAt: '300',
            reviewComment: 'Approved'
        }

        const taskRecord: TaskRecord = parseTaskHashRecord(taskHashRecord)
        const payload = buildTaskServiceResultPayload(taskRecord)

        expect(taskRecord).toEqual({
            taskId: 'task-1',
            taskType: 'leave',
            status: 'APPROVED',
            sourceJobId: 'create-job-1',
            submitterId: 'submitter-1',
            approverIds: ['approver-1'],
            observerIds: ['observer-1'],
            title: 'Annual leave',
            description: 'Family trip',
            details: {
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            },
            createdAt: 100,
            updatedAt: 300,
            reviewedAt: 300,
            reviewComment: 'Approved'
        })
        expect(payload).toEqual({
            taskId: 'task-1',
            taskType: 'leave',
            status: 'APPROVED',
            submitterId: 'submitter-1',
            approverIds: ['approver-1'],
            observerIds: ['observer-1'],
            title: 'Annual leave',
            description: 'Family trip',
            details: {
                leaveType: 'annual',
                startAt: 100,
                endAt: 200
            },
            createdAt: 100,
            updatedAt: 300,
            reviewedAt: 300,
            reviewComment: 'Approved'
        })
    })
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

    const createTaskId = Bun.hash('task:create-job-1').toString()

    const existingTaskHashRecord: Record<string, string> = {
        taskId: createTaskId,
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverIds: JSON.stringify(['U0BJR2NMZ6D']),
        observerIds: JSON.stringify(['U0BJR2NMZ6D']),
        title: 'Annual leave',
        description: 'Family trip',
        details: JSON.stringify(createTaskPayload.details),
        createdAt: '100',
        updatedAt: '100'
    }

    it('creates and saves a new task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getEmployee').mockResolvedValue({
            slackUserId: 'U0AMWQX3CQG',
            name: 'Submitter',
            departmentId: 'R&D',
            isActive: true,
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getTaskDepartment').mockResolvedValue({
            taskType: 'leave',
            departmentId: 'HR',
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getDepartment')
            .mockResolvedValueOnce({
                departmentId: 'R&D',
                name: 'Research and Development',
                adminSlackUserIds: ['U0BJR2NMZ6D', 'U0SECONDAPPROVER'],
                createdAt: 100,
                updatedAt: 100
            })
            .mockResolvedValueOnce({
                departmentId: 'HR',
                name: 'Human Resources',
                adminSlackUserIds: ['U0HRADMIN', 'U0BJR2NMZ6D'],
                createdAt: 100,
                updatedAt: 100
            })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const addSortedSetMemberSpy = vi.spyOn(cacheModule, 'addSortedSetMember').mockResolvedValue(undefined)
        const taskId = Bun.hash('task:create-job-1').toString()

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(organizationModule.getTaskDepartment).toHaveBeenCalledWith('leave')
        expect(setHashSpy).toHaveBeenCalledWith(`tasks:${taskId}`, {
            taskId,
            taskType: 'leave',
            status: 'PENDING',
            sourceJobId: 'create-job-1',
            submitterId: 'U0AMWQX3CQG',
            approverIds: JSON.stringify(['U0BJR2NMZ6D', 'U0SECONDAPPROVER']),
            observerIds: JSON.stringify(['U0HRADMIN']),
            title: 'Annual leave',
            description: 'Family trip',
            details: JSON.stringify(createTaskPayload.details),
            createdAt: '1000',
            updatedAt: '1000'
        })
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith(taskId, {
            requestJobId: 'create-job-1',
            action: 'CREATED',
            operatorId: 'U0AMWQX3CQG',
            currentStatus: 'PENDING',
            createdAt: 1000,
            taskType: 'leave',
            submitterId: 'U0AMWQX3CQG',
            approverIds: ['U0BJR2NMZ6D', 'U0SECONDAPPROVER'],
            observerIds: ['U0HRADMIN'],
            title: 'Annual leave',
            description: 'Family trip',
            details: createTaskPayload.details
        })
        expect(addSortedSetMemberSpy).toHaveBeenNthCalledWith(1, 'tasks:index:submitter:U0AMWQX3CQG', 1000, taskId)
        expect(addSortedSetMemberSpy).toHaveBeenNthCalledWith(2, 'tasks:index:approver:U0BJR2NMZ6D', 1000, taskId)
        expect(addSortedSetMemberSpy).toHaveBeenNthCalledWith(3, 'tasks:index:approver:U0SECONDAPPROVER', 1000, taskId)
        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_CREATED',
            responseName: 'taskCreated',
            payload: {
                taskId,
                taskType: 'leave',
                status: 'PENDING',
                submitterId: 'U0AMWQX3CQG',
                approverIds: ['U0BJR2NMZ6D', 'U0SECONDAPPROVER'],
                observerIds: ['U0HRADMIN'],
                title: 'Annual leave',
                description: 'Family trip',
                details: createTaskPayload.details,
                createdAt: 1000,
                updatedAt: 1000
            }
        })
    })

    it('returns the saved task for the same request', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(existingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const addSortedSetMemberSpy = vi.spyOn(cacheModule, 'addSortedSetMember').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_CREATED',
            responseName: 'taskCreated',
            payload: {
                taskId: createTaskId,
                taskType: 'leave',
                status: 'PENDING',
                submitterId: 'U0AMWQX3CQG',
                approverIds: ['U0BJR2NMZ6D'],
                observerIds: ['U0BJR2NMZ6D'],
                title: 'Annual leave',
                description: 'Family trip',
                details: createTaskPayload.details,
                createdAt: 100,
                updatedAt: 100
            }
        })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(addSortedSetMemberSpy).toHaveBeenNthCalledWith(1, 'tasks:index:submitter:U0AMWQX3CQG', 100, createTaskId)
        expect(addSortedSetMemberSpy).toHaveBeenNthCalledWith(2, 'tasks:index:approver:U0BJR2NMZ6D', 100, createTaskId)
    })

    it('returns an error when the saved task belongs to another request', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...existingTaskHashRecord,
            sourceJobId: 'create-job-2'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ALREADY_EXISTS' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the saved task ID does not match the request key', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...existingTaskHashRecord,
            taskId: 'another-task'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const addSortedSetMemberSpy = vi.spyOn(cacheModule, 'addSortedSetMember').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ID_MISMATCH' })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(addSortedSetMemberSpy).not.toHaveBeenCalled()
    })

    it('returns an error when no task assignment exists', async () => {
        const getHashSpy = vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const getEmployeeSpy = vi.spyOn(organizationModule, 'getEmployee').mockRejectedValue('NO_RECORD_FOUND')

        const result = await createTask({
            ...createTaskPayload,
            submitterId: 'unknown-user'
        }, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(getHashSpy).toHaveBeenCalledWith(`tasks:${Bun.hash('task:create-job-1').toString()}`)
        expect(getEmployeeSpy).toHaveBeenCalledWith('unknown-user')
    })

    it('returns an error when the submitter is inactive', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getEmployee').mockResolvedValue({
            slackUserId: 'U0AMWQX3CQG',
            name: 'Submitter',
            departmentId: 'R&D',
            isActive: false,
            createdAt: 100,
            updatedAt: 100
        })
        const getDepartmentSpy = vi.spyOn(organizationModule, 'getDepartment')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(getDepartmentSpy).not.toHaveBeenCalled()
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the submitter department does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getEmployee').mockResolvedValue({
            slackUserId: 'U0AMWQX3CQG',
            name: 'Submitter',
            departmentId: 'R&D',
            isActive: true,
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getDepartment').mockRejectedValue('NO_RECORD_FOUND')
        const getTaskDepartmentSpy = vi.spyOn(organizationModule, 'getTaskDepartment')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(getTaskDepartmentSpy).not.toHaveBeenCalled()
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when no observer department is assigned to the task type', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getEmployee').mockResolvedValue({
            slackUserId: 'U0AMWQX3CQG',
            name: 'Submitter',
            departmentId: 'R&D',
            isActive: true,
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getDepartment').mockResolvedValue({
            departmentId: 'R&D',
            name: 'Research and Development',
            adminSlackUserIds: ['U0BJR2NMZ6D'],
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getTaskDepartment').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the assigned observer department does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getEmployee').mockResolvedValue({
            slackUserId: 'U0AMWQX3CQG',
            name: 'Submitter',
            departmentId: 'R&D',
            isActive: true,
            createdAt: 100,
            updatedAt: 100
        })
        vi.spyOn(organizationModule, 'getDepartment')
            .mockResolvedValueOnce({
                departmentId: 'R&D',
                name: 'Research and Development',
                adminSlackUserIds: ['U0BJR2NMZ6D'],
                createdAt: 100,
                updatedAt: 100
            })
            .mockRejectedValueOnce('NO_RECORD_FOUND')
        vi.spyOn(organizationModule, 'getTaskDepartment').mockResolvedValue({
            taskType: 'leave',
            departmentId: 'HR',
            createdAt: 100,
            updatedAt: 100
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await createTask(createTaskPayload, 'create-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
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
        reviewType: 'creation',
        approverId: 'U0BJR2NMZ6D',
        decision: 'approve',
        comment: 'Approved'
    }

    const pendingTaskHashRecord: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverIds: JSON.stringify(['U0BJR2NMZ6D']),
        observerIds: JSON.stringify(['U0BJR2NMZ6D']),
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
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload, 'review-job-1')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'APPROVED',
            updatedAt: '1000',
            reviewedAt: '1000',
            reviewComment: 'Approved'
        })
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'review-job-1',
            action: 'CREATION_APPROVED',
            operatorId: 'U0BJR2NMZ6D',
            currentStatus: 'APPROVED',
            comment: 'Approved',
            createdAt: 1000
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
                approverIds: ['U0BJR2NMZ6D'],
                observerIds: ['U0BJR2NMZ6D'],
                title: 'Annual leave',
                description: 'Family trip',
                details: {
                    leaveType: 'annual',
                    startAt: 100,
                    endAt: 200
                },
                createdAt: 100,
                updatedAt: 1000,
                reviewedAt: 1000,
                reviewComment: 'Approved'
            }
        })
    })

    it('rejects and saves a pending task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const rejectPayload: ReviewTaskPayload = {
            ...reviewTaskPayload,
            decision: 'reject',
            comment: 'Insufficient balance'
        }

        const result = await reviewTask(rejectPayload, 'review-job-2')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'REJECTED',
            updatedAt: '1000',
            reviewedAt: '1000',
            reviewComment: 'Insufficient balance'
        })
        expect(result.msg).toBe('TASK_REJECTED')
        expect(result.responseName).toBe('taskRejected')
        expect(result.payload).toEqual(expect.objectContaining({ status: 'REJECTED' }))
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'review-job-2',
            action: 'CREATION_REJECTED',
            operatorId: 'U0BJR2NMZ6D',
            currentStatus: 'REJECTED',
            comment: 'Insufficient balance',
            createdAt: 1000
        })
    })

    it('returns an error when the approver does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask({
            ...reviewTaskPayload,
            approverId: 'another-approver'
        }, 'review-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task was already reviewed', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'APPROVED'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload, 'review-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ALREADY_REVIEWED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task was cancelled', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'CANCELLED'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload, 'review-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ALREADY_CANCELLED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload, 'review-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the stored task ID does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            taskId: 'another-task'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(reviewTaskPayload, 'review-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ID_MISMATCH' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    const revocationReviewPayload: ReviewTaskPayload = {
        taskId: 'task-1',
        reviewType: 'revocation',
        revokeRequestId: 'revoke-job-1',
        approverId: 'U0BJR2NMZ6D',
        decision: 'approve',
        comment: 'Revocation approved'
    }

    const waitingRevokeTaskHashRecord: Record<string, string> = {
        ...pendingTaskHashRecord,
        status: 'WAITING_REVOKE',
        pendingRevokeRequestId: 'revoke-job-1',
        updatedAt: '200',
        reviewedAt: '200',
        reviewComment: 'Approved',
        revokedReason: 'Plans changed'
    }

    it('approves the current revocation request', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(waitingRevokeTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(revocationReviewPayload, 'review-job-3')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'REVOKED',
            pendingRevokeRequestId: '',
            revokeComment: 'Revocation approved',
            updatedAt: '1000',
            revokedAt: '1000'
        })
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'review-job-3',
            action: 'REVOCATION_APPROVED',
            operatorId: 'U0BJR2NMZ6D',
            currentStatus: 'REVOKED',
            comment: 'Revocation approved',
            createdAt: 1000
        })
        expect(result).toEqual(expect.objectContaining({
            res: 'success',
            msg: 'TASK_REVOKED',
            responseName: 'taskRevoked',
            payload: expect.objectContaining({
                status: 'REVOKED',
                revokedAt: 1000,
                revokedReason: 'Plans changed',
                revokeComment: 'Revocation approved'
            })
        }))
    })

    it('returns the task to approved when revocation is rejected', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(waitingRevokeTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)
        const rejectPayload: ReviewTaskPayload = {
            ...revocationReviewPayload,
            decision: 'reject',
            comment: 'Leave must remain active'
        }

        const result = await reviewTask(rejectPayload, 'review-job-4')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'APPROVED',
            pendingRevokeRequestId: '',
            revokeComment: 'Leave must remain active',
            updatedAt: '1000'
        })
        expect(result).toEqual(expect.objectContaining({
            res: 'success',
            msg: 'TASK_REVOCATION_REJECTED',
            responseName: 'taskRevocationRejected',
            payload: expect.objectContaining({
                status: 'APPROVED',
                revokeComment: 'Leave must remain active'
            })
        }))
        expect(result.payload).not.toEqual(expect.objectContaining({ revokedAt: expect.anything() }))
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'review-job-4',
            action: 'REVOCATION_REJECTED',
            operatorId: 'U0BJR2NMZ6D',
            currentStatus: 'APPROVED',
            comment: 'Leave must remain active',
            createdAt: 1000
        })
    })

    it('rejects an expired revocation button', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(waitingRevokeTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask({
            ...revocationReviewPayload,
            revokeRequestId: 'old-revoke-job'
        }, 'review-job-3')

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVOCATION_REVIEW_EXPIRED' })
        expect(setHashSpy).not.toHaveBeenCalled()
        expect(taskHistoryModule.appendTaskHistory).not.toHaveBeenCalled()
    })

    it('rejects a revocation review when no revocation was requested', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...waitingRevokeTaskHashRecord,
            pendingRevokeRequestId: ''
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await reviewTask(revocationReviewPayload, 'review-job-3')

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVOCATION_NOT_REQUESTED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })
})




describe('cancelTask', () => {
    const cancelTaskPayload: CancelTaskPayload = {
        taskId: 'task-1',
        submitterId: 'U0AMWQX3CQG',
        reason: 'Plans changed'
    }

    const pendingTaskHashRecord: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverIds: JSON.stringify(['U0BJR2NMZ6D']),
        observerIds: JSON.stringify(['U0HRADMIN']),
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

    it('cancels a pending task', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask(cancelTaskPayload, 'cancel-job-1')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'CANCELLED',
            updatedAt: '1000',
            cancelledAt: '1000',
            cancelledReason: 'Plans changed'
        })
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'cancel-job-1',
            action: 'CANCELLED',
            operatorId: 'U0AMWQX3CQG',
            currentStatus: 'CANCELLED',
            comment: 'Plans changed',
            createdAt: 1000
        })
        expect(result).toEqual({
            res: 'success',
            msg: 'TASK_CANCELLED',
            responseName: 'taskCancelled',
            payload: {
                taskId: 'task-1',
                taskType: 'leave',
                status: 'CANCELLED',
                submitterId: 'U0AMWQX3CQG',
                approverIds: ['U0BJR2NMZ6D'],
                observerIds: ['U0HRADMIN'],
                title: 'Annual leave',
                description: 'Family trip',
                details: {
                    leaveType: 'annual',
                    startAt: 100,
                    endAt: 200
                },
                createdAt: 100,
                updatedAt: 1000,
                cancelledAt: 1000,
                cancelledReason: 'Plans changed'
            }
        })
    })

    it('returns the saved task when cancel is repeated', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'CANCELLED',
            updatedAt: '1000',
            cancelledAt: '1000',
            cancelledReason: 'Plans changed'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask(cancelTaskPayload, 'cancel-job-1')

        expect(result).toEqual(expect.objectContaining({
            res: 'success',
            msg: 'TASK_CANCELLED',
            responseName: 'taskCancelled',
            payload: expect.objectContaining({ status: 'CANCELLED', updatedAt: 1000, cancelledAt: 1000 })
        }))
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the submitter does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask({
            ...cancelTaskPayload,
            submitterId: 'another-submitter'
        }, 'cancel-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_CANCEL_FORBIDDEN' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task does not exist', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockRejectedValue('NO_RECORD_FOUND')
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask(cancelTaskPayload, 'cancel-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_NOT_FOUND' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the stored task ID does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            taskId: 'another-task'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask(cancelTaskPayload, 'cancel-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_ID_MISMATCH' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('returns an error when the task is not pending', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'APPROVED'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await cancelTask(cancelTaskPayload, 'cancel-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_CANNOT_BE_CANCELLED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

})




describe('revokeTask', () => {
    const revokeTaskPayload: RevokeTaskPayload = {
        taskId: 'task-1',
        submitterId: 'U0AMWQX3CQG',
        reason: 'Plans changed'
    }

    const approvedTaskHashRecord: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'APPROVED',
        sourceJobId: 'create-job-1',
        submitterId: 'U0AMWQX3CQG',
        approverIds: JSON.stringify(['U0BJR2NMZ6D']),
        observerIds: JSON.stringify(['U0HRADMIN']),
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

    it('moves an approved task to waiting revoke', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(approvedTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask(revokeTaskPayload, 'revoke-job-1')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'WAITING_REVOKE',
            pendingRevokeRequestId: 'revoke-job-1',
            revokedReason: 'Plans changed',
            revokeComment: '',
            updatedAt: '1000'
        })
        expect(taskHistoryModule.appendTaskHistory).toHaveBeenCalledWith('task-1', {
            requestJobId: 'revoke-job-1',
            action: 'REVOCATION_REQUESTED',
            operatorId: 'U0AMWQX3CQG',
            currentStatus: 'WAITING_REVOKE',
            comment: 'Plans changed',
            createdAt: 1000
        })
        expect(result).toEqual(expect.objectContaining({
            res: 'success',
            msg: 'TASK_REVOCATION_WAITING',
            responseName: 'taskRevocationWaiting',
            payload: expect.objectContaining({
                status: 'WAITING_REVOKE',
                revokedReason: 'Plans changed',
                updatedAt: 1000
            })
        }))
    })

    it('clears values left by a previously rejected revocation', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000)
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskHashRecord,
            revokedReason: 'Previous reason',
            revokeComment: 'Previous rejection comment'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask({
            taskId: 'task-1',
            submitterId: 'U0AMWQX3CQG'
        }, 'revoke-job-2')

        expect(setHashSpy).toHaveBeenCalledWith('tasks:task-1', {
            status: 'WAITING_REVOKE',
            pendingRevokeRequestId: 'revoke-job-2',
            revokedReason: '',
            revokeComment: '',
            updatedAt: '1000'
        })
        expect(result.payload).not.toHaveProperty('revokedReason')
        expect(result.payload).not.toHaveProperty('revokeComment')
    })

    it('returns the saved result when the same revoke request is repeated', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskHashRecord,
            status: 'WAITING_REVOKE',
            pendingRevokeRequestId: 'revoke-job-1',
            revokedReason: 'Plans changed'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask(revokeTaskPayload, 'revoke-job-1')

        expect(result).toEqual(expect.objectContaining({
            res: 'success',
            msg: 'TASK_REVOCATION_WAITING',
            responseName: 'taskRevocationWaiting'
        }))
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('rejects a second revoke request while one is pending', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskHashRecord,
            status: 'WAITING_REVOKE',
            pendingRevokeRequestId: 'another-revoke-job'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask(revokeTaskPayload, 'revoke-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVOCATION_ALREADY_REQUESTED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('rejects revoke when the task is not approved', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...approvedTaskHashRecord,
            status: 'PENDING'
        })
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask(revokeTaskPayload, 'revoke-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_CANNOT_BE_REVOKED' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })

    it('rejects revoke when the submitter does not match', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(approvedTaskHashRecord)
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        const result = await revokeTask({
            ...revokeTaskPayload,
            submitterId: 'another-submitter'
        }, 'revoke-job-1')

        expect(result).toEqual({ res: 'error', msg: 'TASK_REVOKE_FORBIDDEN' })
        expect(setHashSpy).not.toHaveBeenCalled()
    })
})




describe('listTasks', () => {
    const submitterId = 'U0AMWQX3CQG'
    const approverId = 'U0BJR2NMZ6D'
    const taskDetails = {
        leaveType: 'annual' as const,
        startAt: 100,
        endAt: 200
    }

    const pendingTaskHashRecord: Record<string, string> = {
        taskId: 'task-1',
        taskType: 'leave',
        status: 'PENDING',
        sourceJobId: 'create-job-1',
        submitterId,
        approverIds: JSON.stringify([approverId]),
        observerIds: JSON.stringify([approverId]),
        title: 'Annual leave',
        description: 'Family trip',
        details: JSON.stringify(taskDetails),
        createdAt: '100',
        updatedAt: '100'
    }

    const approvedTaskHashRecord: Record<string, string> = {
        ...pendingTaskHashRecord,
        taskId: 'task-2',
        status: 'APPROVED',
        title: 'Approved annual leave',
        createdAt: '200',
        updatedAt: '300',
        reviewedAt: '300',
        reviewComment: 'Approved'
    }

    it('lists tasks for a submitter by created time', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-2', 'task-1'])
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockResolvedValueOnce(approvedTaskHashRecord)
            .mockResolvedValueOnce(pendingTaskHashRecord)
        const payload: ListTasksPayload = { submitterId, createdAtFrom: 100, createdAtTo: 200 }

        const result = await listTasks(payload)

        expect(getSortedSetMembersSpy).toHaveBeenCalledWith(`tasks:index:submitter:${submitterId}`, 100, 200)
        expect(result).toEqual({
            res: 'success',
            msg: 'TASKS_LISTED',
            responseName: 'taskListed',
            payload: [
                {
                    taskId: 'task-2',
                    taskType: 'leave',
                    status: 'APPROVED',
                    submitterId,
                    approverIds: [approverId],
                    observerIds: [approverId],
                    title: 'Approved annual leave',
                    description: 'Family trip',
                    details: taskDetails,
                    createdAt: 200,
                    updatedAt: 300,
                    reviewedAt: 300,
                    reviewComment: 'Approved'
                },
                {
                    taskId: 'task-1',
                    taskType: 'leave',
                    status: 'PENDING',
                    submitterId,
                    approverIds: [approverId],
                    observerIds: [approverId],
                    title: 'Annual leave',
                    description: 'Family trip',
                    details: taskDetails,
                    createdAt: 100,
                    updatedAt: 100
                }
            ]
        })
    })

    it('filters approver tasks by status and reviewed time', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-2', 'task-1'])
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockResolvedValueOnce(approvedTaskHashRecord)
            .mockResolvedValueOnce(pendingTaskHashRecord)
        const payload: ListTasksPayload = {
            approverId,
            status: 'APPROVED',
            reviewedAtFrom: 250,
            reviewedAtTo: 350
        }

        const result = await listTasks(payload)

        expect(getSortedSetMembersSpy).toHaveBeenCalledWith(`tasks:index:approver:${approverId}`, undefined, undefined)
        expect(result.payload).toEqual([
            expect.objectContaining({ taskId: 'task-2', status: 'APPROVED', reviewedAt: 300 })
        ])
    })

    it('includes cancelled tasks by default', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-1'])
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'CANCELLED'
        })

        const result = await listTasks({ submitterId })

        expect(result.payload).toEqual([
            expect.objectContaining({ taskId: 'task-1', status: 'CANCELLED' })
        ])
    })

    it('lists cancelled tasks when cancelled status is provided', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-1'])
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            status: 'CANCELLED'
        })

        const result = await listTasks({ submitterId, status: 'CANCELLED' })

        expect(result.payload).toEqual([
            expect.objectContaining({ taskId: 'task-1', status: 'CANCELLED' })
        ])
    })

    it('loads one task directly when taskId is provided', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers')
        const getHashAllFieldsSpy = vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue(pendingTaskHashRecord)
        const payload: ListTasksPayload = { submitterId, taskId: 'task-1' }

        const result = await listTasks(payload)

        expect(getSortedSetMembersSpy).not.toHaveBeenCalled()
        expect(getHashAllFieldsSpy).toHaveBeenCalledWith('tasks:task-1')
        expect(result.payload).toEqual([
            expect.objectContaining({ taskId: 'task-1', submitterId })
        ])
    })

    it('returns an empty list when taskId is not visible to the submitter', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers')
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            submitterId: 'another-submitter'
        })
        const payload: ListTasksPayload = { submitterId, taskId: 'task-1' }

        const result = await listTasks(payload)

        expect(result.payload).toEqual([])
    })

    it('filters leave tasks by leaveType', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-1', 'task-2'])
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockResolvedValueOnce(pendingTaskHashRecord)
            .mockResolvedValueOnce({
                ...pendingTaskHashRecord,
                taskId: 'task-2',
                details: JSON.stringify({
                    leaveType: 'personal',
                    startAt: 300,
                    endAt: 400
                })
            })
        const payload: ListTasksPayload = { submitterId, taskType: 'leave', leaveType: 'personal' }

        const result = await listTasks(payload)

        expect(result.payload).toEqual([
            expect.objectContaining({
                taskId: 'task-2',
                details: {
                    leaveType: 'personal',
                    startAt: 300,
                    endAt: 400
                }
            })
        ])
    })

    it('skips missing tasks and tasks owned by another submitter', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['missing-task', 'task-1'])
        vi.spyOn(cacheModule, 'getHashAllFields')
            .mockRejectedValueOnce('NO_RECORD_FOUND')
            .mockResolvedValueOnce({ ...pendingTaskHashRecord, submitterId: 'another-submitter' })

        const result = await listTasks({ submitterId })

        expect(result.payload).toEqual([])
    })

    it('skips a task when the stored task ID does not match the index', async () => {
        vi.spyOn(cacheModule, 'getSortedSetMembers').mockResolvedValue(['task-1'])
        const getHashAllFieldsSpy = vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            ...pendingTaskHashRecord,
            taskId: 'another-task'
        })

        const result = await listTasks({ submitterId })

        expect(getHashAllFieldsSpy).toHaveBeenCalledWith('tasks:task-1')
        expect(result.payload).toEqual([])
    })

    it('throws when both user IDs are provided', async () => {
        const payload = { submitterId, approverId } as unknown as ListTasksPayload

        await expect(listTasks(payload)).rejects.toBe('INVALID_LIST_TASKS_USER')
    })

    it('throws when leaveType is provided without leave taskType', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers')
        const payload = { submitterId, leaveType: 'annual' } as unknown as ListTasksPayload

        await expect(listTasks(payload)).rejects.toBe('INVALID_LIST_TASKS_LEAVE_TYPE_FILTER')
        expect(getSortedSetMembersSpy).not.toHaveBeenCalled()
    })

    it('throws when the created time range is invalid', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers')
        const payload: ListTasksPayload = { submitterId, createdAtFrom: 400, createdAtTo: 300 }

        await expect(listTasks(payload)).rejects.toBe('INVALID_LIST_TASKS_CREATED_AT_RANGE')
        expect(getSortedSetMembersSpy).not.toHaveBeenCalled()
    })

    it('throws when the reviewed time range is invalid', async () => {
        const getSortedSetMembersSpy = vi.spyOn(cacheModule, 'getSortedSetMembers')
        const payload: ListTasksPayload = { approverId, reviewedAtFrom: 400, reviewedAtTo: 300 }

        await expect(listTasks(payload)).rejects.toBe('INVALID_LIST_TASKS_REVIEWED_AT_RANGE')
        expect(getSortedSetMembersSpy).not.toHaveBeenCalled()
    })
})
