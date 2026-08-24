export const supportedLeaveTypes = ['annual', 'sick', 'personal', 'marriage', 'maternity'] as const

export type LeaveType = typeof supportedLeaveTypes[number]

export type LeaveTaskDetails = {
    leaveType: LeaveType,
    startAt: number,
    endAt: number
}

export type CreateLeaveTaskPayload = {
    taskType: 'leave',
    title: string,
    description?: string,
    submitterId: string,
    details: LeaveTaskDetails
}

export type UpdateLeaveTaskPayload = {
    taskId: string,
    submitterId: string,
    title: string,
    description?: string,
    details: LeaveTaskDetails
}
