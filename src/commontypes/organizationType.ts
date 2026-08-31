import type { TaskType } from './taskType'

export type Employee = {
    slackUserId: string,
    name: string,
    departmentId: string,
    isActive: boolean,
    createdAt: number,
    updatedAt: number
}

export type Department = {
    departmentId: string,
    name: string,
    adminSlackUserIds: string[],
    createdAt: number,
    updatedAt: number
}


export type TaskDepartment = {
    taskType: TaskType,
    departmentId: string,
    createdAt: number,
    updatedAt: number
}
