export type Employee = {
    slackUserId: string,
    name: string,
    departmentId: string,
    isActive: boolean,
    createdAt: number,
    updatedAt: number
}

export type DepartmentConfig = {
    departmentId: string,
    departmentName: string,
    adminSlackUserId: string,
    createdAt: number,
    updatedAt: number
}