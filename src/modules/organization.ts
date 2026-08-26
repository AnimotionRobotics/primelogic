import type { Department, Employee } from '@commontypes/organizationType'
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




// Save a department record
export const setDepartment = async (department: Department): Promise<void> => {

    if (!department) throw 'MISSING_PARAMETER_DEPARTMENT'
    if (!department.departmentId) throw 'MISSING_DEPARTMENT_ID'
    if (!department.name) throw 'MISSING_DEPARTMENT_NAME'
    if (!department.adminSlackUserId) throw 'MISSING_DEPARTMENT_ADMIN_SLACK_USER_ID'
    if (!Number.isFinite(department.createdAt) || !Number.isFinite(department.updatedAt)) throw 'INVALID_DEPARTMENT_TIME'
    if (department.updatedAt < department.createdAt) throw 'INVALID_DEPARTMENT_TIME'

    await setHash(`departments:${department.departmentId}`, {
        departmentId: department.departmentId,
        name: department.name,
        adminSlackUserId: department.adminSlackUserId,
        createdAt: department.createdAt.toString(),
        updatedAt: department.updatedAt.toString()
    })

}




// Load a department record
export const getDepartment = async (departmentId: string): Promise<Department> => {

    if (!departmentId) throw 'MISSING_DEPARTMENT_ID'

    const departmentFields = await getHashAllFields(`departments:${departmentId}`)
    const createdAt = Number(departmentFields.createdAt)
    const updatedAt = Number(departmentFields.updatedAt)

    if (departmentFields.departmentId !== departmentId) throw 'INVALID_DEPARTMENT_RECORD'
    if (!departmentFields.name || !departmentFields.adminSlackUserId) throw 'INVALID_DEPARTMENT_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_DEPARTMENT_RECORD'

    return {
        departmentId: departmentFields.departmentId,
        name: departmentFields.name,
        adminSlackUserId: departmentFields.adminSlackUserId,
        createdAt,
        updatedAt
    }

}
