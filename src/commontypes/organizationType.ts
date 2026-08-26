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
    adminSlackUserId: string,
    createdAt: number,
    updatedAt: number
}
