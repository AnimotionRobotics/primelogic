import { addSortedSetMember, getHashAllFields, getSortedSetMembers, setHash } from '@modules/cache'
import { getDepartment, getEmployee, getTaskDepartment } from '@modules/organization'
import type { ResponseName } from '@commontypes/messageType'
import type { CancelTaskPayload, CreateTaskPayload, ReviewTaskPayload, RevokeTaskPayload, TaskRecord, TaskStatus, ListTasksPayload, ListTasksResponsePayload} from '@commontypes/taskType'
import { buildTaskServiceResultPayload, matchesListTaskFilters, parseTaskHashRecord, validateLeaveTaskDetails, validateListTasksPayload } from './taskSupport'
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
    let existingTaskHashRecord: Record<string, string> | undefined
    try {
        existingTaskHashRecord = await getHashAllFields(taskKey)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') {
            throw error
        }
    }

    // Check if the task belongs to another request
    if (existingTaskHashRecord && existingTaskHashRecord.sourceJobId !== requestJobId) {
        return { res: 'error', msg: 'TASK_ALREADY_EXISTS' }
    }

    if (existingTaskHashRecord && existingTaskHashRecord.taskId !== taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    // Return the existing task for the same request
    if (existingTaskHashRecord) {
        const existingTaskRecord = parseTaskHashRecord(existingTaskHashRecord)
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

    // Load the submitter record
    let submitter
    try {
        submitter = await getEmployee(payload.submitterId)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Reject task assignment for an inactive submitter
    if (!submitter.isActive) {
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Load the submitter department
    let submitterDepartment
    try {
        submitterDepartment = await getDepartment(submitter.departmentId)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Use the submitter department admins as approvers
    const approverIds = [...new Set(submitterDepartment.adminSlackUserIds)]
    const observerIds = new Set<string>()

    // Load the observer department assignment for the task type
    let taskDepartment
    try {
        taskDepartment = await getTaskDepartment(payload.taskType)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Load the assigned observer department
    let observerDepartment
    try {
        observerDepartment = await getDepartment(taskDepartment.departmentId)
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') throw error
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Use the assigned department admins as observers
    for (const observerId of observerDepartment.adminSlackUserIds) {
        observerIds.add(observerId)
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

    // Build the Redis Hash record
    const taskHashRecord: Record<string, string> = {
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
        taskHashRecord.description = taskRecord.description
    }

    await setHash(taskKey, taskHashRecord)

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





// Cancel a pending task without deleting its saved record
export const cancelTask = async (payload: CancelTaskPayload): Promise<HandlerResult> => {

    const hasRequiredCancelProperties = 'taskId' in payload && 'submitterId' in payload

    if (!hasRequiredCancelProperties) {
        throw 'INVALID_CANCEL_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        throw 'INVALID_TASK_CANCEL_REASON'
    }

    // Load the task
    const taskKey = `tasks:${payload.taskId}`
    let taskHashRecord: Record<string, string>
    try {
        taskHashRecord = await getHashAllFields(taskKey)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }

        throw error
    }

    if (taskHashRecord.taskId !== payload.taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    if (taskHashRecord.submitterId !== payload.submitterId) {
        return { res: 'error', msg: 'TASK_CANCEL_FORBIDDEN' }
    }

    const taskRecord = parseTaskHashRecord(taskHashRecord)

    // Return the saved task when the cancel request is repeated
    if (taskRecord.status === 'CANCELLED') {
        const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

        return { res: 'success', msg: 'TASK_CANCELLED', responseName: 'taskCancelled', payload: taskServiceResultPayload }
    }

    if (taskRecord.status !== 'PENDING') {
        return { res: 'error', msg: 'TASK_CANNOT_BE_CANCELLED' }
    }

    // Save the cancelled status
    const cancelledAt = Date.now()
    const cancelledTaskHashRecord: Record<string, string> = {
        status: 'CANCELLED',
        updatedAt: cancelledAt.toString(),
        cancelledAt: cancelledAt.toString()
    }

    if (payload.reason !== undefined) {
        cancelledTaskHashRecord.cancelledReason = payload.reason
    }

    await setHash(taskKey, cancelledTaskHashRecord)

    // Build the response
    const cancelledTaskRecord: TaskRecord = {
        ...taskRecord,
        status: 'CANCELLED',
        updatedAt: cancelledAt,
        cancelledAt
    }

    if (payload.reason !== undefined) {
        cancelledTaskRecord.cancelledReason = payload.reason
    }

    const taskServiceResultPayload = buildTaskServiceResultPayload(cancelledTaskRecord)

    return { res: 'success', msg: 'TASK_CANCELLED', responseName: 'taskCancelled', payload: taskServiceResultPayload }
}




// Request approval to revoke an approved task
export const revokeTask = async (payload: RevokeTaskPayload, requestJobId: string): Promise<HandlerResult> => {

    const hasRequiredRevokeProperties = 'taskId' in payload && 'submitterId' in payload

    if (!hasRequiredRevokeProperties) {
        throw 'INVALID_REVOKE_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (typeof payload.submitterId !== 'string' || payload.submitterId.trim().length === 0) {
        throw 'INVALID_TASK_SUBMITTER_ID'
    }

    if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        throw 'INVALID_TASK_REVOKE_REASON'
    }

    if (typeof requestJobId !== 'string' || requestJobId.trim().length === 0) {
        throw 'INVALID_REQUEST_JOB_ID'
    }

    // Load the task before validating revocation ownership and state.
    const taskKey = `tasks:${payload.taskId}`
    let taskHashRecord: Record<string, string>
    try {
        taskHashRecord = await getHashAllFields(taskKey)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }

        throw error
    }

    if (taskHashRecord.taskId !== payload.taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    if (taskHashRecord.submitterId !== payload.submitterId) {
        return { res: 'error', msg: 'TASK_REVOKE_FORBIDDEN' }
    }

    const taskRecord = parseTaskHashRecord(taskHashRecord)

    // Replay the saved result when the same revoke request is delivered again.
    if (taskRecord.status === 'WAITING_REVOKE' && taskRecord.pendingRevokeRequestId === requestJobId) {
        const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

        return { res: 'success', msg: 'TASK_REVOCATION_WAITING', responseName: 'taskRevocationWaiting', payload: taskServiceResultPayload }
    }

    if (taskRecord.status === 'REVOKED') {
        return { res: 'error', msg: 'TASK_ALREADY_REVOKED' }
    }

    if (taskRecord.status === 'WAITING_REVOKE') {
        return { res: 'error', msg: 'TASK_REVOCATION_ALREADY_REQUESTED' }
    }

    if (taskRecord.status !== 'APPROVED') {
        return { res: 'error', msg: 'TASK_CANNOT_BE_REVOKED' }
    }

    if (taskRecord.pendingRevokeRequestId) {
        return { res: 'error', msg: 'TASK_REVOCATION_ALREADY_REQUESTED' }
    }

    // Persist the revocation request and expose its pending approval state.
    const updatedAt = Date.now()
    const revokedReason = payload.reason ?? ''

    await setHash(taskKey, {
        status: 'WAITING_REVOKE',
        pendingRevokeRequestId: requestJobId,
        revokedReason,
        revokeComment: '', // Clear the review comment left by a previously rejected revocation request
        updatedAt: updatedAt.toString()
    })

    const revocationWaitingTaskRecord: TaskRecord = {
        ...taskRecord,
        status: 'WAITING_REVOKE',
        pendingRevokeRequestId: requestJobId,
        updatedAt
    }

    delete revocationWaitingTaskRecord.revokeComment

    if (payload.reason !== undefined) {
        revocationWaitingTaskRecord.revokedReason = payload.reason
    } else {
        delete revocationWaitingTaskRecord.revokedReason
    }

    const taskServiceResultPayload = buildTaskServiceResultPayload(revocationWaitingTaskRecord)

    return { res: 'success', msg: 'TASK_REVOCATION_WAITING', responseName: 'taskRevocationWaiting', payload: taskServiceResultPayload }
}




// Review a task creation or revocation request
export const reviewTask = async (payload: ReviewTaskPayload): Promise<HandlerResult> => {

    const hasRequiredReviewProperties = 'taskId' in payload && 'reviewType' in payload && 'approverId' in payload && 'decision' in payload

    if (!hasRequiredReviewProperties) {
        throw 'INVALID_REVIEW_TASK_PAYLOAD'
    }

    if (typeof payload.taskId !== 'string' || payload.taskId.trim().length === 0) {
        throw 'INVALID_TASK_ID'
    }

    if (payload.reviewType !== 'creation' && payload.reviewType !== 'revocation') {
        throw 'INVALID_REVIEW_TYPE'
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

    if (payload.reviewType === 'revocation' && (typeof payload.revokeRequestId !== 'string' || payload.revokeRequestId.trim().length === 0)) {
        throw 'INVALID_REVOKE_REQUEST_ID'
    }

    // Load the task and verify the reviewer before selecting a workflow.
    const taskKey = `tasks:${payload.taskId}`
    let taskHashRecord: Record<string, string>
    try {
        taskHashRecord = await getHashAllFields(taskKey)
    } catch (error) {
        if (error === 'NO_RECORD_FOUND') {
            return { res: 'error', msg: 'TASK_NOT_FOUND' }
        }

        throw error
    }

    if (taskHashRecord.taskId !== payload.taskId) {
        return { res: 'error', msg: 'TASK_ID_MISMATCH' }
    }

    const taskRecord = parseTaskHashRecord(taskHashRecord)

    if (!taskRecord.approverIds.includes(payload.approverId)) {
        return { res: 'error', msg: 'TASK_REVIEW_FORBIDDEN' }
    }

    // Review the initial creation request.
    if (payload.reviewType === 'creation') {
        if (taskRecord.status === 'CANCELLED') {
            return { res: 'error', msg: 'TASK_ALREADY_CANCELLED' }
        }

        if (taskRecord.status !== 'PENDING') {
            return { res: 'error', msg: 'TASK_ALREADY_REVIEWED' }
        }

        const reviewStatus: TaskStatus = payload.decision === 'approve' ? 'APPROVED' : 'REJECTED'
        const reviewedAt = Date.now()
        const reviewedTaskHashRecord: Record<string, string> = {
            status: reviewStatus,
            updatedAt: reviewedAt.toString(),
            reviewedAt: reviewedAt.toString()
        }

        if (payload.comment !== undefined) {
            reviewedTaskHashRecord.reviewComment = payload.comment
        }

        await setHash(taskKey, reviewedTaskHashRecord)

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

    // Review the currently pending revocation request.
    if (taskRecord.status === 'REVOKED') {
        return { res: 'error', msg: 'TASK_ALREADY_REVOKED' }
    }

    if (taskRecord.status !== 'WAITING_REVOKE') {
        return { res: 'error', msg: 'TASK_REVOCATION_REVIEW_NOT_ALLOWED' }
    }

    if (!taskRecord.pendingRevokeRequestId) {
        return { res: 'error', msg: 'TASK_REVOCATION_NOT_REQUESTED' }
    }

    if (taskRecord.pendingRevokeRequestId !== payload.revokeRequestId) {
        return { res: 'error', msg: 'TASK_REVOCATION_REVIEW_EXPIRED' }
    }

    const reviewStatus: TaskStatus = payload.decision === 'approve' ? 'REVOKED' : 'APPROVED'
    const reviewedAt = Date.now()
    const reviewedTaskHashRecord: Record<string, string> = {
        status: reviewStatus,
        pendingRevokeRequestId: '',
        revokeComment: payload.comment ?? '',
        updatedAt: reviewedAt.toString()
    }

    if (reviewStatus === 'REVOKED') {
        reviewedTaskHashRecord.revokedAt = reviewedAt.toString()
    }

    await setHash(taskKey, reviewedTaskHashRecord)

    const reviewedTaskRecord: TaskRecord = {
        ...taskRecord,
        status: reviewStatus,
        updatedAt: reviewedAt
    }

    delete reviewedTaskRecord.pendingRevokeRequestId

    if (payload.comment !== undefined) {
        reviewedTaskRecord.revokeComment = payload.comment
    } else {
        delete reviewedTaskRecord.revokeComment
    }

    if (reviewStatus === 'REVOKED') {
        reviewedTaskRecord.revokedAt = reviewedAt
    }

    const responseName: ResponseName = reviewStatus === 'REVOKED' ? 'taskRevoked' : 'taskRevocationRejected'
    const resultMessage = reviewStatus === 'REVOKED' ? 'TASK_REVOKED' : 'TASK_REVOCATION_REJECTED'
    const taskServiceResultPayload = buildTaskServiceResultPayload(reviewedTaskRecord)

    return { res: 'success', msg: resultMessage, responseName, payload: taskServiceResultPayload }
}




// List tasks for a submitter or approver
export const listTasks = async (payload: ListTasksPayload): Promise<HandlerResult> => {
    validateListTasksPayload(payload)

    const hasSubmitterId = payload.submitterId !== undefined

    // Get taskIds
    const taskIndexKey = hasSubmitterId ? `tasks:index:submitter:${payload.submitterId}` : `tasks:index:approver:${payload.approverId}`
    const taskIds = payload.taskId !== undefined ? [payload.taskId] : await getSortedSetMembers(taskIndexKey, payload.createdAtFrom, payload.createdAtTo)

    const listTasksResponsePayload: ListTasksResponsePayload = []
    // Load and filter tasks
    for (const taskId of taskIds) {
        let taskHashRecord: Record<string, string>
        try {
            taskHashRecord = await getHashAllFields(`tasks:${taskId}`)
        } catch (error) {
            if (error === 'NO_RECORD_FOUND') {
                continue
            }

            throw error
        }

        if (taskHashRecord.taskId !== taskId) {
            continue
        }

        if (payload.submitterId !== undefined && taskHashRecord.submitterId !== payload.submitterId) {
            continue
        }

        const taskRecord = parseTaskHashRecord(taskHashRecord)

        if (payload.approverId !== undefined && !taskRecord.approverIds.includes(payload.approverId)) {
            continue
        }

        if (!matchesListTaskFilters(taskRecord, payload)) {
            continue
        }

        // Build the task result
        const taskServiceResultPayload = buildTaskServiceResultPayload(taskRecord)

        listTasksResponsePayload.push(taskServiceResultPayload)
    }

    return { res: 'success', msg: 'TASKS_LISTED', responseName: 'taskListed', payload: listTasksResponsePayload }
}
