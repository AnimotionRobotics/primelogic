import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import { getDepartment, getEmployee, setDepartment, setEmployee } from '@modules/organization'
import type { Department, Employee } from '@commontypes/organizationType'




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
        adminSlackUserId: 'U456',
        createdAt: 100,
        updatedAt: 200
    }

    it('saves a department', async () => {
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await setDepartment(department)

        expect(setHashSpy).toHaveBeenCalledWith('departments:engineering', {
            departmentId: 'engineering',
            name: 'Engineering',
            adminSlackUserId: 'U456',
            createdAt: '100',
            updatedAt: '200'
        })
    })

    it('loads a department', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            departmentId: 'engineering',
            name: 'Engineering',
            adminSlackUserId: 'U456',
            createdAt: '100',
            updatedAt: '200'
        })

        const result = await getDepartment('engineering')

        expect(result).toEqual(department)
    })
})
