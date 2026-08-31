import type { Department, Employee, TaskDepartment } from '@commontypes/organizationType'
import { supportedTaskTypes } from '@commontypes/taskType'
import type { TaskType } from '@commontypes/taskType'
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

    const employeeHashRecord = await getHashAllFields(`employees:${slackUserId}`)
    const createdAt = Number(employeeHashRecord.createdAt)
    const updatedAt = Number(employeeHashRecord.updatedAt)

    if (employeeHashRecord.slackUserId !== slackUserId) throw 'INVALID_EMPLOYEE_RECORD'
    if (!employeeHashRecord.name || !employeeHashRecord.departmentId) throw 'INVALID_EMPLOYEE_RECORD'
    if (employeeHashRecord.isActive !== 'true' && employeeHashRecord.isActive !== 'false') throw 'INVALID_EMPLOYEE_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_EMPLOYEE_RECORD'

    return {
        slackUserId: employeeHashRecord.slackUserId,
        name: employeeHashRecord.name,
        departmentId: employeeHashRecord.departmentId,
        isActive: employeeHashRecord.isActive === 'true',
        createdAt,
        updatedAt
    }

}




// Save a department record
export const setDepartment = async (department: Department): Promise<void> => {

    if (!department) throw 'MISSING_PARAMETER_DEPARTMENT'
    if (!department.departmentId) throw 'MISSING_DEPARTMENT_ID'
    if (!department.name) throw 'MISSING_DEPARTMENT_NAME'
    if (!Array.isArray(department.adminSlackUserIds) || department.adminSlackUserIds.length === 0) throw 'MISSING_DEPARTMENT_ADMIN_SLACK_USER_IDS'
    if (department.adminSlackUserIds.some((adminSlackUserId) => typeof adminSlackUserId !== 'string' || adminSlackUserId.trim().length === 0)) throw 'INVALID_DEPARTMENT_ADMIN_SLACK_USER_IDS'
    if (!Number.isFinite(department.createdAt) || !Number.isFinite(department.updatedAt)) throw 'INVALID_DEPARTMENT_TIME'
    if (department.updatedAt < department.createdAt) throw 'INVALID_DEPARTMENT_TIME'

    await setHash(`departments:${department.departmentId}`, {
        departmentId: department.departmentId,
        name: department.name,
        adminSlackUserIds: JSON.stringify(department.adminSlackUserIds),
        createdAt: department.createdAt.toString(),
        updatedAt: department.updatedAt.toString()
    })

}




// Load a department record
export const getDepartment = async (departmentId: string): Promise<Department> => {

    if (!departmentId) throw 'MISSING_DEPARTMENT_ID'

    const departmentHashRecord = await getHashAllFields(`departments:${departmentId}`)
    const createdAt = Number(departmentHashRecord.createdAt)
    const updatedAt = Number(departmentHashRecord.updatedAt)
    let adminSlackUserIds: unknown

    try {
        adminSlackUserIds = JSON.parse(departmentHashRecord.adminSlackUserIds)
    } catch (error) {
        throw 'INVALID_DEPARTMENT_RECORD'
    }

    if (departmentHashRecord.departmentId !== departmentId) throw 'INVALID_DEPARTMENT_RECORD'
    if (!departmentHashRecord.name || !Array.isArray(adminSlackUserIds) || adminSlackUserIds.length === 0) throw 'INVALID_DEPARTMENT_RECORD'
    if (adminSlackUserIds.some((adminSlackUserId) => typeof adminSlackUserId !== 'string' || adminSlackUserId.trim().length === 0)) throw 'INVALID_DEPARTMENT_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_DEPARTMENT_RECORD'

    return {
        departmentId: departmentHashRecord.departmentId,
        name: departmentHashRecord.name,
        adminSlackUserIds,
        createdAt,
        updatedAt
    }

}




// Save the observer department assigned to a task type
export const setTaskDepartment = async (taskDepartment: TaskDepartment): Promise<void> => {

    if (!taskDepartment) throw 'MISSING_PARAMETER_TASK_DEPARTMENT'
    if (!supportedTaskTypes.includes(taskDepartment.taskType)) throw 'INVALID_TASK_DEPARTMENT_TASK_TYPE'
    if (!taskDepartment.departmentId) throw 'MISSING_TASK_DEPARTMENT_ID'
    if (!Number.isFinite(taskDepartment.createdAt) || !Number.isFinite(taskDepartment.updatedAt)) throw 'INVALID_TASK_DEPARTMENT_TIME'
    if (taskDepartment.updatedAt < taskDepartment.createdAt) throw 'INVALID_TASK_DEPARTMENT_TIME'

    await setHash(`taskDepartments:${taskDepartment.taskType}`, {
        taskType: taskDepartment.taskType,
        departmentId: taskDepartment.departmentId,
        createdAt: taskDepartment.createdAt.toString(),
        updatedAt: taskDepartment.updatedAt.toString()
    })

}




// Load the observer department assigned to a task type
export const getTaskDepartment = async (taskType: TaskType): Promise<TaskDepartment> => {

    if (!supportedTaskTypes.includes(taskType)) throw 'INVALID_TASK_DEPARTMENT_TASK_TYPE'

    const taskDepartmentHashRecord = await getHashAllFields(`taskDepartments:${taskType}`)
    const createdAt = Number(taskDepartmentHashRecord.createdAt)
    const updatedAt = Number(taskDepartmentHashRecord.updatedAt)

    if (taskDepartmentHashRecord.taskType !== taskType) throw 'INVALID_TASK_DEPARTMENT_RECORD'
    if (!taskDepartmentHashRecord.departmentId) throw 'INVALID_TASK_DEPARTMENT_RECORD'
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) throw 'INVALID_TASK_DEPARTMENT_RECORD'

    return {
        taskType,
        departmentId: taskDepartmentHashRecord.departmentId,
        createdAt,
        updatedAt
    }

}
