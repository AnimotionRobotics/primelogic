import type { DepartmentConfig, Employee } from '@commontypes/organizationType'
import { getHashAllFields, setHash } from '@modules/cache'




// Save an employee record
export const setEmployee = async (employee: Employee): Promise<void> => {

    if (!employee) throw 'MISSING_PARAMETER_EMPLOYEE'
    if (!employee.slackUserId) throw 'MISSING_EMPLOYEE_SLACK_USER_ID'
    if (!employee.name) throw 'MISSING_EMPLOYEE_NAME'
    if (!employee.departmentId) throw 'MISSING_EMPLOYEE_DEPARTMENT_ID'
    if (typeof employee.isActive !== 'boolean') throw 'INVALID_EMPLOYEE_ACTIVE_STATUS'
    if (!Number.isFinite(employee.createdAt) || !Number.isFinite(employee.updatedAt)) throw 'INVALID_EMPLOYEE_TIME'
    if (employee.updatedAt < employee.createdAt) throw 'INVALID_EMPLOYEE_TIME'

    await setHash(`employees:${employee.slackUserId}`, {
        slackUserId: employee.slackUserId,
        name: employee.name,
        departmentId: employee.departmentId,
        isActive: employee.isActive.toString(),
        createdAt: employee.createdAt.toString(),
        updatedAt: employee.updatedAt.toString()
    })

}




// Load an employee record
export const getEmployee = async (slackUserId: string): Promise<Employee> => {

    if (!slackUserId) throw 'MISSING_EMPLOYEE_SLACK_USER_ID'

    const employeeFields = await getHashAllFields(`employees:${slackUserId}`)
    const createdAt = Number(employeeFields.createdAt)
    const updatedAt = Number(employeeFields.updatedAt)

    if (employeeFields.slackUserId !== slackUserId) throw 'INVALID_EMPLOYEE_RECORD'
    if (!employeeFields.name || !employeeFields.departmentId) throw 'INVALID_EMPLOYEE_RECORD'
    if (employeeFields.isActive !== 'true' && employeeFields.isActive !== 'false') throw 'INVALID_EMPLOYEE_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_EMPLOYEE_RECORD'

    return {
        slackUserId: employeeFields.slackUserId,
        name: employeeFields.name,
        departmentId: employeeFields.departmentId,
        isActive: employeeFields.isActive === 'true',
        createdAt,
        updatedAt
    }

}




// Save a department config
export const setDepartmentConfig = async (departmentConfig: DepartmentConfig): Promise<void> => {

    if (!departmentConfig) throw 'MISSING_PARAMETER_DEPARTMENT_CONFIG'
    if (!departmentConfig.departmentId) throw 'MISSING_DEPARTMENT_ID'
    if (!departmentConfig.departmentName) throw 'MISSING_DEPARTMENT_NAME'
    if (!departmentConfig.adminSlackUserId) throw 'MISSING_DEPARTMENT_ADMIN_SLACK_USER_ID'
    if (!Number.isFinite(departmentConfig.createdAt) || !Number.isFinite(departmentConfig.updatedAt)) throw 'INVALID_DEPARTMENT_CONFIG_TIME'
    if (departmentConfig.updatedAt < departmentConfig.createdAt) throw 'INVALID_DEPARTMENT_CONFIG_TIME'

    await setHash(`departmentConfigs:${departmentConfig.departmentId}`, {
        departmentId: departmentConfig.departmentId,
        departmentName: departmentConfig.departmentName,
        adminSlackUserId: departmentConfig.adminSlackUserId,
        createdAt: departmentConfig.createdAt.toString(),
        updatedAt: departmentConfig.updatedAt.toString()
    })

}




// Load a department config
export const getDepartmentConfig = async (departmentId: string): Promise<DepartmentConfig> => {

    if (!departmentId) throw 'MISSING_DEPARTMENT_ID'

    const departmentConfigFields = await getHashAllFields(`departmentConfigs:${departmentId}`)
    const createdAt = Number(departmentConfigFields.createdAt)
    const updatedAt = Number(departmentConfigFields.updatedAt)

    if (departmentConfigFields.departmentId !== departmentId) throw 'INVALID_DEPARTMENT_CONFIG_RECORD'
    if (!departmentConfigFields.departmentName || !departmentConfigFields.adminSlackUserId) throw 'INVALID_DEPARTMENT_CONFIG_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_DEPARTMENT_CONFIG_RECORD'

    return {
        departmentId: departmentConfigFields.departmentId,
        departmentName: departmentConfigFields.departmentName,
        adminSlackUserId: departmentConfigFields.adminSlackUserId,
        createdAt,
        updatedAt
    }

}
