import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import { getDepartment, getEmployee, getTaskDepartment, setDepartment, setEmployee, setTaskDepartment } from '@modules/organization'
import type { Department, Employee, TaskDepartment } from '@commontypes/organizationType'




beforeEach(() => {
    vi.restoreAllMocks()
})




describe('employee', () => {
    const employee: Employee = {
        slackUserId: 'U123',
        name: 'Alice',
        departmentId: 'engineering',
        isActive: true,
        createdAt: 100,
        updatedAt: 200
    }

    it('saves an employee', async () => {
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await setEmployee(employee)

        expect(setHashSpy).toHaveBeenCalledWith('employees:U123', {
            slackUserId: 'U123',
            name: 'Alice',
            departmentId: 'engineering',
            isActive: 'true',
            createdAt: '100',
            updatedAt: '200'
        })
    })

    it('loads an employee', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            slackUserId: 'U123',
            name: 'Alice',
            departmentId: 'engineering',
            isActive: 'true',
            createdAt: '100',
            updatedAt: '200'
        })

        const result = await getEmployee('U123')

        expect(result).toEqual(employee)
    })
})




describe('department', () => {
    const department: Department = {
        departmentId: 'engineering',
        name: 'Engineering',
        adminSlackUserIds: ['U456', 'U789'],
        createdAt: 100,
        updatedAt: 200
    }

    it('saves a department', async () => {
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await setDepartment(department)

        expect(setHashSpy).toHaveBeenCalledWith('departments:engineering', {
            departmentId: 'engineering',
            name: 'Engineering',
            adminSlackUserIds: JSON.stringify(['U456', 'U789']),
            createdAt: '100',
            updatedAt: '200'
        })
    })

    it('loads a department', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            departmentId: 'engineering',
            name: 'Engineering',
            adminSlackUserIds: JSON.stringify(['U456', 'U789']),
            createdAt: '100',
            updatedAt: '200'
        })

        const result = await getDepartment('engineering')

        expect(result).toEqual(department)
    })
})




describe('taskDepartment', () => {
    const taskDepartment: TaskDepartment = {
        taskType: 'leave',
        departmentId: 'HR',
        createdAt: 100,
        updatedAt: 200
    }

    it('saves a task department assignment', async () => {
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await setTaskDepartment(taskDepartment)

        expect(setHashSpy).toHaveBeenCalledWith('taskDepartments:leave', {
            taskType: 'leave',
            departmentId: 'HR',
            createdAt: '100',
            updatedAt: '200'
        })
    })

    it('loads a task department assignment', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            taskType: 'leave',
            departmentId: 'HR',
            createdAt: '100',
            updatedAt: '200'
        })

        const result = await getTaskDepartment('leave')

        expect(result).toEqual(taskDepartment)
    })
})
