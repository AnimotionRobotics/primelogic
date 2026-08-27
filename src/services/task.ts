import { addSortedSetMember, deleteHashFields, getHashAllFields, getSortedSetMembers, setHash } from '@modules/cache'
import { getDepartment, getEmployee } from '@modules/organization'
import type { ResponseName } from '@commontypes/messageType'
import { supportedTaskStatuses, supportedTaskTypes} from '@commontypes/taskType'
import { supportedLeaveTypes } from '@commontypes/leaveTaskType'
import type { CreateTaskPayload, DeleteTaskPayload, ReviewTaskPayload, UpdateTaskPayload, TaskRecord, TaskStatus, ListTasksPayload, ListTasksResponsePayload} from '@commontypes/taskType'
import { buildTaskServiceResultPayload, parseTaskRecord, taskObserverDepartmentIds, validateLeaveTaskDetails } from './taskSupport'
import type { HandlerResult, TaskDetailsValidator } from './taskSupport'

// Add one file to selected tasks
export const addFileToTask = async (config): Promise<HandlerResult> => {

    const configObj = config
    // check if the selected items exist in database
    const metadata = JSON.parse(configObj.metadata)
    const userId = configObj.userId
    const selectedValues = configObj.selectedValues
    const fileId = configObj.fileId

    // check task id if exists by using each selectedValues
    // key: work:entities for entries like: task, mission, feature, approval, incident, meeting, reminder, etc
    let workEntities = []
    let notFound = []
    for (const item of selectedValues) {
        let res
        try {
            res = await getHashAllFields(item)
        }catch(e){
            if (e === 'NO_RECORD_FOUND') {
                notFound.push(item)
                continue
            }

            throw e
        }
        res ? workEntities.push(res) : null
    }

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

    // Check task fields
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

    // Check task details
    let taskDetailsValidator: TaskDetailsValidator | null = null

    taskDetailsValidator = payload.taskType === 'leave' ? validateLeaveTaskDetails : taskDetailsValidator

    if (!taskDetailsValidator) {
        throw 'UNSUPPORTED_TASK_TYPE'
    }

    taskDetailsValidator(payload.details)

    // Build task ID from requestJobId
    const taskId = Bun.hash(`task:${requestJobId}`).toString()
    const taskKey = `tasks:${taskId}`

    // Find an existing task
    let existingTaskFields: Record<string, string> | undefined
    try {
        existingTaskFields = await getHashAllFields(taskKey)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') {
            throw error
        }
    }

    // Check if the task belongs to another request
    if (existingTaskFields && existingTaskFields.sourceJobId !== requestJobId) {
        return { res: 'error', msg: 'TASK_ALREADY_EXISTS' }
    }

    if (existingTaskFields && existingTaskFields.taskId !== taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    // Return the existing task for the same request
    if (existingTaskFields) {
        const existingTaskRecord = parseTaskRecord(existingTaskFields)
        const existingTaskServiceResultPayload = buildTaskServiceResultPayload(existingTaskRecord)

        // Add the task to both indexes again
        const taskIndexSubmitterKey = `tasks:index:submitter:${existingTaskRecord.submitterId}`

        await addSortedSetMember(taskIndexSubmitterKey, existingTaskRecord.createdAt, existingTaskRecord.taskId)

        for (const approverId of existingTaskRecord.approverIds) {
            const taskIndexApproverKey = `tasks:index:approver:${approverId}`
            await addSortedSetMember(taskIndexApproverKey, existingTaskRecord.createdAt, existingTaskRecord.taskId)
        }

        return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: existingTaskServiceResultPayload }
    }

    // Load the submitter's department
    let submitter
    try {
        submitter = await getEmployee(payload.submitterId)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    if (!submitter.isActive) {
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Load the approver from the submitter's department
    let submitterDepartment
    try {
        submitterDepartment = await getDepartment(submitter.departmentId)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    const approverIds = [submitterDepartment.adminSlackUserId]
    const observerIds = new Set<string>()

    // Load observers
    for (const observerDepartmentId of taskObserverDepartmentIds[payload.taskType]) {
        let observerDepartment
        try {
            observerDepartment = await getDepartment(observerDepartmentId)
        } catch (error) {
            if (error !== 'NO_RECORD_FOUND') throw error
            return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
        }

        observerIds.add(observerDepartment.adminSlackUserId)
    }

    // Remove approvers from observers
    for (const approverId of approverIds) {
        observerIds.delete(approverId)
    }

    // Build a new task
    const now = Date.now()
    const taskRecord: TaskRecord = {
        taskId,
        taskType: payload.taskType,
        status: 'PENDING',

        sourceJobId: requestJobId,

        submitterId: payload.submitterId,
        approverIds,
        observerIds: [...observerIds],

        title: payload.title,
        description: payload.description,
        details: payload.details,

        createdAt: now,
        updatedAt: now
    }

    // Build Redis hash fields
    const taskHashFields: Record<string, string> = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        sourceJobId: taskRecord.sourceJobId,

        submitterId: taskRecord.submitterId,
        approverIds: JSON.stringify(taskRecord.approverIds),
        observerIds: JSON.stringify(taskRecord.observerIds),

        title: taskRecord.title,
        details: JSON.stringify(taskRecord.details),

        createdAt: taskRecord.createdAt.toString(),
        updatedAt: taskRecord.updatedAt.toString()
    }

    if (taskRecord.description !== undefined) {
        taskHashFields.description = taskRecord.description
    }

    await setHash(taskKey, taskHashFields)

    // Add the task to submitter and approver indexes
    const taskIndexSubmitterKey = `tasks:index:submitter:${taskRecord.submitterId}`

    await addSortedSetMember(taskIndexSubmitterKey, taskRecord.createdAt, taskRecord.taskId)

    for (const approverId of taskRecord.approverIds) {
        const taskIndexApproverKey = `tasks:index:approver:${approverId}`
        await addSortedSetMember(taskIndexApproverKey, taskRecord.createdAt, taskRecord.taskId)
    }

    // Build the response
    const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

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

    if (taskFields.status === 'DELETED') {
        return { res: 'error', msg: 'TASK_ALREADY_DELETED' }
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

    // Check task details
    let taskDetailsValidator: TaskDetailsValidator | null = null

    taskDetailsValidator = taskFields.taskType === 'leave' ? validateLeaveTaskDetails : taskDetailsValidator

    if (!taskDetailsValidator) {
        throw 'UNSUPPORTED_TASK_TYPE'
    }

    taskDetailsValidator(payload.details)

    const updatedAt = Date.now()
    const updatedFields: Record<string, string> = {
        status: 'PENDING',
        title: payload.title,
        details: JSON.stringify(payload.details),
        updatedAt: updatedAt.toString()
    }

    if (payload.description !== undefined) {
        updatedFields.description = payload.description
    }

    await setHash(taskKey, updatedFields)

    await deleteHashFields(taskKey, ['reviewedAt', 'reviewComment'])

    const taskRecord = parseTaskRecord(taskFields)
    const updatedTaskRecord: TaskRecord = {
        ...taskRecord,
        status: 'PENDING',
        title: payload.title,
        details: payload.details,
        updatedAt
    }

    const updatedDescription = payload.description ?? taskFields.description

    if (updatedDescription !== undefined) {
        updatedTaskRecord.description = updatedDescription
    }

    delete updatedTaskRecord.reviewedAt
    delete updatedTaskRecord.reviewComment

    const taskServiceResultPayload = buildTaskServiceResultPayload(updatedTaskRecord)

    return { res: 'success', msg: 'TASK_UPDATED', responseName: 'taskUpdated',  payload: taskServiceResultPayload }
}





// Mark a task as deleted
export const deleteTask = async (payload: DeleteTaskPayload): Promise<HandlerResult> => {

    const hasRequiredDeleteFields = 'taskId' in payload && 'submitterId' in payload

    if (!hasRequiredDeleteFields) {
        throw 'INVALID_DELETE_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    // Load the task
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
        return { res: 'error', msg: 'TASK_DELETE_FORBIDDEN' }
    }

    const taskRecord = parseTaskRecord(taskFields)

    // Return the saved task when the delete request is repeated
    if (taskRecord.status === 'DELETED') {
        const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

        return { res: 'success', msg: 'TASK_DELETED', responseName: 'taskDeleted', payload: taskServiceResultPayload }
    }

    // Save the deleted status
    const updatedAt = Date.now()
    await setHash(taskKey, {
        status: 'DELETED',
        updatedAt: updatedAt.toString()
    })

    // Build the response
    const deletedTaskRecord: TaskRecord = {
        ...taskRecord,
        status: 'DELETED',
        updatedAt
    }
    const taskServiceResultPayload = buildTaskServiceResultPayload(deletedTaskRecord)

    return { res: 'success', msg: 'TASK_DELETED', responseName: 'taskDeleted', payload: taskServiceResultPayload }
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

    // Check review permission
    const taskRecord = parseTaskRecord(taskFields)

    if (!taskRecord.approverIds.includes(payload.approverId)) {
        return { res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' }
    }

    if (taskRecord.status === 'DELETED') {
        return { res: 'error', msg: 'TASK_ALREADY_DELETED' }
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
    await setHash(taskKey, updatedFields)

    // Build the service response
    const responseName: ResponseName = reviewStatus === 'APPROVED' ? 'taskApproved' : 'taskRejected'
    const resultMessage = reviewStatus === 'APPROVED' ? 'TASK_APPROVED' : 'TASK_REJECTED'
    const reviewedTaskRecord: TaskRecord = {
        ...taskRecord,
        status: reviewStatus,
        updatedAt: reviewedAt,
        reviewedAt
    }

    if (payload.comment !== undefined) {
        reviewedTaskRecord.reviewComment = payload.comment
    }

    const taskServiceResultPayload = buildTaskServiceResultPayload(reviewedTaskRecord)

    return { res: 'success', msg: resultMessage, responseName, payload: taskServiceResultPayload }
}




// List tasks for a submitter or approver
export const listTasks = async (payload: ListTasksPayload): Promise<HandlerResult> => {
    // Check the user
    const hasSubmitterId = payload.submitterId !== undefined
    const hasApproverId = payload.approverId !== undefined

    if (hasSubmitterId === hasApproverId) {
        throw 'INVALID_LIST_TASKS_USER'
    }

    if (payload.submitterId !== undefined && (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_SUBMITTER_ID'
    }

    if (payload.approverId !== undefined && (typeof payload.approverId !== 'string' || payload.approverId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_APPROVER_ID'
    }

    if (payload.taskId !== undefined && (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0)) {
        throw 'INVALID_LIST_TASKS_TASK_ID'
    }

    if (payload.taskType !== undefined && !supportedTaskTypes.includes(payload.taskType)) {
        throw 'INVALID_LIST_TASKS_TASK_TYPE'
    }

    if (payload.status !== undefined && !supportedTaskStatuses.includes(payload.status)) {
        throw 'INVALID_LIST_TASKS_STATUS'
    }

    if (payload.leaveType !== undefined && payload.taskType !== 'leave') {
        throw 'INVALID_LIST_TASKS_LEAVE_TYPE_FILTER'
    }

    if (payload.leaveType !== undefined && !supportedLeaveTypes.includes(payload.leaveType)) {
        throw 'INVALID_LIST_TASKS_LEAVE_TYPE'
    }

    if (payload.createdAtFrom !== undefined && !Number.isFinite(payload.createdAtFrom)) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_FROM'
    }

    if (payload.createdAtTo !== undefined && !Number.isFinite(payload.createdAtTo)) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_TO'
    }

    if (payload.createdAtFrom !== undefined && payload.createdAtTo !== undefined && payload.createdAtFrom > payload.createdAtTo) {
        throw 'INVALID_LIST_TASKS_CREATED_AT_RANGE'
    }

    if (payload.reviewedAtFrom !== undefined && !Number.isFinite(payload.reviewedAtFrom)) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_FROM'
    }

    if (payload.reviewedAtTo !== undefined && !Number.isFinite(payload.reviewedAtTo)) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_TO'
    }

    if (payload.reviewedAtFrom !== undefined && payload.reviewedAtTo !== undefined && payload.reviewedAtFrom > payload.reviewedAtTo) {
        throw 'INVALID_LIST_TASKS_REVIEWED_AT_RANGE'
    }

    // Get taskIds
    const taskIndexKey = hasSubmitterId ? `tasks:index:submitter:${payload.submitterId}` : `tasks:index:approver:${payload.approverId}`
    const taskIds = payload.taskId !== undefined ? [payload.taskId] : await getSortedSetMembers(taskIndexKey, payload.createdAtFrom, payload.createdAtTo)

    const listTasksResponsePayload: ListTasksResponsePayload = []
    // Load and filter tasks
    for (const taskId of taskIds) {
        let taskFields: Record<string, string>
        try {
            taskFields = await getHashAllFields(`tasks:${taskId}`)
        } catch (error) {
            if (error === 'NO_RECORD_FOUND') {
                continue
            }

            throw error
        }

        if (taskFields.taskId !== taskId) {
            continue
        }

        if (payload.submitterId !== undefined && taskFields.submitterId !== payload.submitterId) {
            continue
        }

        const taskRecord = parseTaskRecord(taskFields)

        if (payload.approverId !== undefined && !taskRecord.approverIds.includes(payload.approverId)) {
            continue
        }

        if (payload.taskType !== undefined && taskRecord.taskType !== payload.taskType) {
            continue
        }

        if (payload.status !== undefined && taskRecord.status !== payload.status) {
            continue
        }

        if (payload.status === undefined && taskRecord.status === 'DELETED') {
            continue
        }

        if (payload.leaveType !== undefined && taskRecord.details.leaveType !== payload.leaveType && taskRecord.taskType === 'leave') {
            continue
        }

        if (payload.createdAtFrom !== undefined && taskRecord.createdAt < payload.createdAtFrom) {
            continue
        }

        if (payload.createdAtTo !== undefined && taskRecord.createdAt > payload.createdAtTo) {
            continue
        }

        const reviewedAt = taskRecord.reviewedAt

        if (payload.reviewedAtFrom !== undefined && (reviewedAt === undefined || reviewedAt < payload.reviewedAtFrom)) {
            continue
        }

        if (payload.reviewedAtTo !== undefined && (reviewedAt === undefined || reviewedAt > payload.reviewedAtTo)) {
            continue
        }

        // Build the task result
        const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

        listTasksResponsePayload.push(taskServiceResultPayload)
    }

    return { res: 'success', msg: 'TASKS_LISTED', responseName: 'taskListed', payload: listTasksResponsePayload }
}
