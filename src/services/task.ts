import { deleteHashFields, getHashAllFields, setHash } from '@modules/cache'
import type { ResponseName } from '@commontypes/messageType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import type { CreateTaskPayload, ReviewTaskPayload, UpdateTaskPayload, TaskDetails, TaskRecord, TaskServiceResultPayload, TaskStatus, TaskType} from '@commontypes/taskType'
import { taskAssignments } from './taskAssignments'
import type { HandlerResult } from './taskServiceType'

// Add one file to selected tasks
export const addFileToTask = async (config): Promise<HandlerResult> => {

    const configObj = config
    // check if the selected items exist in database
    const metadata = JSON.parse(configObj.metadata)
    const userId = configObj.userId
    const selectedValues = configObj.selectedValues
    const fileId = configObj.fileId
    console.log('metadata: ', metadata, '\nuserId: ', userId, '\nselectedValue: ', selectedValues)

    // check task id if exists by using each selectedValues
    // key: work:entities for entries like: task, mission, feature, approval, incident, meeting, reminder, etc
    let workEntities = []
    let notFound = []
    for (const item of selectedValues) {
        let res
        try {
            res = await getHashAllFields(item)
        }catch(e){
            console.log('Error when getHashField(), e: ', e)

            if (e === 'NO_RECORD_FOUND') {
                notFound.push(item)
                continue
            }

            throw e
        }
        res ? workEntities.push(res) : null
    }
    console.log('workEntities: ', workEntities, '\nnotFound: ', notFound)

    // workEntities if empty, should broadcast back to message producer with description of error detail
    if (workEntities.length === 0) {
        return { res: 'error', msg: 'NO_TASK_FOUND' }
    }


    // workEntities length is less than selectedValues, this is when some selectedValues don't have value found in db
    if (workEntities.length < configObj.selectedValues.length) {
        return { res: 'error', msg: 'NOT_FOUND:' + notFound}
    }


    // get file id, file detail, user detail, selected project | task detail


    // download file, and upload to object storage service, and get file url


    // store to DB as task entity


    // return result in msg for message queue level script to response back to producer
    return { res: 'success',  msg: `successfully added file to ${workEntities.length} tasks`, responseName: 'fileAddedToTask', payload: { fileId, taskIds: selectedValues} }
}




// Create a task and save it
export const createTask = async (payload: CreateTaskPayload, requestJobId: string): Promise<HandlerResult> => {

    if (!('taskType' in payload)) {
        throw 'INVALID_CREATE_TASK_PAYLOAD'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
        throw 'INVALID_TASK_TITLE'
    }

    if (payload.description !== undefined && typeof payload.description !== 'string') {
        throw 'INVALID_TASK_DESCRIPTION'
    }

    if (!payload.details || typeof payload.details !== 'object') {
        throw 'INVALID_TASK_DETAILS'
    }

    switch (payload.taskType) {
        case 'leave': {
            if (!('leaveType' in payload.details) || !supportedLeaveTypes.includes(payload.details.leaveType)) {
                throw 'INVALID_LEAVE_TYPE'
            }
            const hasValidStartAt = 'startAt' in payload.details && typeof payload.details.startAt === 'number' && Number.isFinite(payload.details.startAt)
            const hasValidEndAt = 'endAt' in payload.details && typeof payload.details.endAt === 'number' && Number.isFinite(payload.details.endAt)

            if (!hasValidStartAt || !hasValidEndAt) {
                throw 'INVALID_LEAVE_TIME'
            }

            if (payload.details.startAt >= payload.details.endAt) {
                throw 'INVALID_LEAVE_TIME_RANGE'
            }

            break
        }

        default:
            throw 'UNSUPPORTED_TASK_TYPE'
    }

    // Find the task assignment
    const taskAssignmentKey = `${payload.taskType}:${payload.submitterId}`
    const taskAssignment = taskAssignments[taskAssignmentKey]
    if (!taskAssignment) {
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Build the task record
    const taskId = Bun.hash(`task:${requestJobId}`).toString()
    const now = Date.now()

    const taskRecord: TaskRecord = {
        taskId,
        taskType: payload.taskType,
        status: 'PENDING',

        sourceJobId: requestJobId,

        submitterId: payload.submitterId,
        approverId: taskAssignment.approverId,
        observerId: taskAssignment.observerId,

        title: payload.title,
        description: payload.description,
        details: payload.details,

        createdAt: now,
        updatedAt: now
    }

    const taskKey = `tasks:${taskId}`

    // Check whether the task already exists
    let existingTaskFields: Record<string, string> | undefined
    try {
        existingTaskFields = await getHashAllFields(taskKey)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') {
            throw error
        }
    }

    if (existingTaskFields && existingTaskFields.sourceJobId !== requestJobId) {
        return { res: 'error', msg: 'TASK_ALREADY_EXISTS' }
    }

    // Return the saved task when the same request is retried
    if (existingTaskFields) {
        const existingTaskServiceResultPayload: TaskServiceResultPayload = {
            taskId: existingTaskFields.taskId,
            taskType: existingTaskFields.taskType as TaskType,
            status: existingTaskFields.status as TaskStatus,

            submitterId: existingTaskFields.submitterId,
            approverId: existingTaskFields.approverId,
            observerId: existingTaskFields.observerId,

            title: existingTaskFields.title,
            details: JSON.parse(existingTaskFields.details) as TaskDetails
        }

        if (existingTaskFields.description !== undefined) {
            existingTaskServiceResultPayload.description = existingTaskFields.description
        }

        return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: existingTaskServiceResultPayload }
    }

    const taskHashFields: Record<string, string> = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        sourceJobId: taskRecord.sourceJobId,

        submitterId: taskRecord.submitterId,
        approverId: taskRecord.approverId,
        observerId: taskRecord.observerId,

        title: taskRecord.title,
        details: JSON.stringify(taskRecord.details),

        createdAt: taskRecord.createdAt.toString(),
        updatedAt: taskRecord.updatedAt.toString()
    }

    if (taskRecord.description !== undefined) {
        taskHashFields.description = taskRecord.description
    }

    // Save the task record
    await setHash(taskKey, taskHashFields)

    // Build the service response
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        submitterId: taskRecord.submitterId,
        approverId: taskRecord.approverId,
        observerId: taskRecord.observerId,

        title: taskRecord.title,
        details: taskRecord.details
    }

    if (taskRecord.description !== undefined) {
        taskServiceResultPayload.description = taskRecord.description
    }

    return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: taskServiceResultPayload }
}





// Update a task and reset it to pending for another review
export const updateTask = async (payload: UpdateTaskPayload): Promise<HandlerResult> => {

    const hasRequiredUpdateFields = 'taskId' in payload && 'submitterId' in payload && 'title' in payload && 'details' in payload

    if (!hasRequiredUpdateFields) {
        throw 'INVALID_UPDATE_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    const taskKey = `tasks:${payload.taskId}`
    let taskFields: Record<string, string>
    try {
        taskFields = await getHashAllFields(taskKey)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }
        throw error
    }

    if (taskFields.taskId !== payload.taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    if (taskFields.submitterId !== payload.submitterId) {
        return { res: 'error', msg: 'TASK_UPDATE_FORBIDDEN' }
    }

    if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
        throw 'INVALID_TASK_TITLE'
    }

    if (payload.description !== undefined && typeof payload.description !== 'string') {
        throw 'INVALID_TASK_DESCRIPTION'
    }

    if (!payload.details || typeof payload.details !== 'object') {
        throw 'INVALID_TASK_DETAILS'
    }

    switch (taskFields.taskType) {
        case 'leave': {
            if (!supportedLeaveTypes.includes(payload.details.leaveType)) {
                throw 'INVALID_LEAVE_TYPE'
            }

            const hasValidStartAt = typeof payload.details.startAt === 'number' && Number.isFinite(payload.details.startAt)
            const hasValidEndAt =  typeof payload.details.endAt === 'number' && Number.isFinite(payload.details.endAt)
            if (!hasValidStartAt || !hasValidEndAt) {
                throw 'INVALID_LEAVE_TIME'
            }

            if (payload.details.startAt >= payload.details.endAt) {
                throw 'INVALID_LEAVE_TIME_RANGE'
            }
            break
        }

        default:
            throw 'UNSUPPORTED_TASK_TYPE'
    }

    const updatedFields: Record<string, string> = {
        status: 'PENDING',
        title: payload.title,
        details: JSON.stringify(payload.details),
        updatedAt: Date.now().toString()
    }

    if (payload.description !== undefined) {
        updatedFields.description = payload.description
    }

    await setHash(taskKey, updatedFields)

    await deleteHashFields(taskKey, ['reviewedAt', 'reviewComment'])

    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskFields.taskId,
        taskType: taskFields.taskType,
        status: 'PENDING',

        submitterId: taskFields.submitterId,
        approverId: taskFields.approverId,
        observerId: taskFields.observerId,

        title: payload.title,
        details: payload.details
    }

    const updatedDescription = payload.description ?? taskFields.description

    if (updatedDescription !== undefined) {
        taskServiceResultPayload.description = updatedDescription
    }

    return { res: 'success', msg: 'TASK_UPDATED', responseName: 'taskUpdated',  payload: taskServiceResultPayload }
}





// Review a task and update it
export const reviewTask = async (payload: ReviewTaskPayload): Promise<HandlerResult> => {

    const hasRequiredReviewFields = 'taskId' in payload && 'approverId' in payload && 'decision' in payload

    if (!hasRequiredReviewFields) {
        throw 'INVALID_REVIEW_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.approverId !== 'string' || payload.approverId.trim().length === 0) {
        throw 'INVALID_APPROVER_ID'
    }

    if (payload.decision !== 'approve' && payload.decision !== 'reject') {
        throw 'INVALID_REVIEW_DECISION'
    }

    if (payload.comment !== undefined && typeof payload.comment !== 'string') {
        throw 'INVALID_REVIEW_COMMENT'
    }

    // Load the task record
    let taskFields: Record<string, string>
    try {
        taskFields = await getHashAllFields(`tasks:${payload.taskId}`)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }
        throw error
    }

    // Check review permission
    if (payload.approverId !== taskFields.approverId) {
        return { res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' }
    }

    // Check whether the task has already been reviewed
    if (taskFields.status !== 'PENDING') {
        return { res: 'error', msg: 'TASK_ALREADY_REVIEWED' }
    }

    // Build the review update
    const reviewStatus: TaskStatus = payload.decision === 'approve' ? 'APPROVED' : 'REJECTED'
    const reviewedAt = Date.now()
    const updatedFields: Record<string, string> = {
        status: reviewStatus,
        updatedAt: reviewedAt.toString(),
        reviewedAt: reviewedAt.toString()
    }

    if (payload.comment !== undefined) {
        updatedFields.reviewComment = payload.comment
    }

    // Save the review result
    await setHash(`tasks:${payload.taskId}`, updatedFields)

    // Build the service response
    const taskDetails = JSON.parse(taskFields.details) as TaskDetails
    const responseName: ResponseName = reviewStatus === 'APPROVED' ? 'taskApproved' : 'taskRejected'
    const resultMessage = reviewStatus === 'APPROVED' ? 'TASK_APPROVED' : 'TASK_REJECTED'

    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: payload.taskId,
        taskType: taskFields.taskType as TaskType,
        status: reviewStatus,

        submitterId: taskFields.submitterId,
        approverId: taskFields.approverId,
        observerId: taskFields.observerId,

        title: taskFields.title,
        details: taskDetails
    }

    if (taskFields.description !== undefined) {
        taskServiceResultPayload.description = taskFields.description
    }

    if (payload.comment !== undefined) {
        taskServiceResultPayload.reviewComment = payload.comment
    }

    return { res: 'success', msg: resultMessage, responseName, payload: taskServiceResultPayload }
}
