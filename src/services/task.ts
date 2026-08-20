/**
 * Task Related Logics
 * 1. add files to tasks
 * 2. ...
 */
import { getHashAllFields, setHash } from '@modules/cache'
import type { HandlerResult } from '@commontypes/handlerType'
import type { CreateTaskPayload, TaskAssignment, TaskRecord, TaskServiceResultPayload } from '@/commontypes/taskType'

const taskAssignments: Record<string, TaskAssignment> = {
    'leave:U0AMWQX3CQG': {
        taskType: 'leave',
        submitterId: 'U0AMWQX3CQG',
        approverId: 'U0BJR2NMZ6D',
        observerId: 'U0BJR2NMZ6D'
    }
}


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
        return { res: 'error', msg: 'NOT_FOUND:'+notFound}
    }


    // get file id, file detail, user detail, selected project | task detail


    // download file, and upload to object storage service, and get file url


    // store to DB as task entity


    // return result in msg for message queue level script to response back to producer
    return { res: 'success',  msg: `successfully added file to ${workEntities.length} tasks`, responseName: 'fileAddedToTask', payload: { fileId, taskIds: selectedValues} }
}


export const createTask = async (payload: CreateTaskPayload, requestJobId: string): Promise<HandlerResult> => {

    if(!payload) throw 'MISSING_PARAMETER_PAYLOAD'
    if(!requestJobId) throw 'MISSING_PARAMETER_REQUEST_JOB_ID'

    if (typeof payload !== 'object' || !('taskType' in payload)) {
        throw 'INVALID_CREATE_TASK_PAYLOAD'
    }

    if (!payload.title || typeof payload.title !== 'string') throw 'INVALID_TASK_TITLE'
    if (!payload.submitterId || typeof payload.submitterId !== 'string') throw 'INVALID_TASK_SUBMITTER_ID'
    if (!payload.details || typeof payload.details !== 'object' || !('leaveType' in payload.details)) throw 'INVALID_TASK_DETAILS'


    switch (payload.taskType) {
        case 'leave':
            if (!('startAt' in payload.details) || typeof payload.details.startAt !== 'number' || !Number.isFinite(payload.details.startAt)
                || !('endAt' in payload.details) || typeof payload.details.endAt !== 'number' || !Number.isFinite(payload.details.endAt) ) {
                throw 'INVALID_LEAVE_TASK_DETAILS'
            }

            if (payload.details.startAt >= payload.details.endAt) {
                throw 'INVALID_LEAVE_TIME_RANGE'
            }

            break

        default:
            throw 'UNSUPPORTED_TASK_TYPE'
    }


    // Search approverId and observerId according to taskType and submitterId
    const taskAssignmentKey = `${payload.taskType}:${payload.submitterId}`
    const taskAssignment = taskAssignments[taskAssignmentKey]
    if (!taskAssignment) {
        return { res: 'error', msg: 'TASK_ASSIGNMENT_NOT_FOUND' }
    }

    // Build TaskRecord and save to "db"
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
    // Save task record only if tasks:<taskId> does not exist
    try {
        await getHashAllFields(taskKey)
        return { res: 'error', msg: 'TASK_ALREADY_EXISTS' }
    } catch (error) {
        if (error !== 'NO_RECORD_FOUND') {
            throw error
        }
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

    await setHash(taskKey, taskHashFields)

    // Send back service result
    const taskServiceResultPayload: TaskServiceResultPayload = {
        taskId: taskRecord.taskId,
        taskType: taskRecord.taskType,
        status: taskRecord.status,

        submitterId: taskRecord.submitterId,
        approverId: taskRecord.approverId,
        observerId: taskRecord.observerId,

        title: taskRecord.title,
        description: taskRecord.description,
        details: taskRecord.details
    }

    return { res: 'success', msg: 'TASK_CREATED', responseName: 'taskCreated', payload: taskServiceResultPayload }
}
