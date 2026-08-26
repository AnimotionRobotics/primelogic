import { beforeEach, describe, expect, it, vi } from 'bun:test'
import * as cacheModule from '@modules/cache'
import { getDepartmentConfig, getEmployee, setDepartmentConfig, setEmployee } from '@modules/organization'
import type { DepartmentConfig, Employee } from '@commontypes/organizationType'




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




describe('department config', () => {
    const departmentConfig: DepartmentConfig = {
        departmentId: 'engineering',
        departmentName: 'Engineering',
        adminSlackUserId: 'U456',
        createdAt: 100,
        updatedAt: 200
    }

    it('saves a department config', async () => {
        const setHashSpy = vi.spyOn(cacheModule, 'setHash').mockResolvedValue(undefined)

        await setDepartmentConfig(departmentConfig)

        expect(setHashSpy).toHaveBeenCalledWith('departmentConfigs:engineering', {
            departmentId: 'engineering',
            departmentName: 'Engineering',
            adminSlackUserId: 'U456',
            createdAt: '100',
            updatedAt: '200'
        })
    })

    it('loads a department config', async () => {
        vi.spyOn(cacheModule, 'getHashAllFields').mockResolvedValue({
            departmentId: 'engineering',
            departmentName: 'Engineering',
            adminSlackUserId: 'U456',
            createdAt: '100',
            updatedAt: '200'
        })

        const result = await getDepartmentConfig('engineering')

        expect(result).toEqual(departmentConfig)
    })
})
