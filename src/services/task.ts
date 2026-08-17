/**
 * Task Related Logics
 * 1. add files to tasks
 * 2. ...
 */
import { getHashAllFields } from '@modules/cache'
import type { HandlerResult } from '@commontypes/handlerType'



export const addFileToTask = async (config): Promise<HandlerResult> => {

    const configObj = JSON.parse(config)
    console.log('configObj: ', configObj)

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
            e === 'NO_RECORD_FOUND' ? notFound.push(item) : null
            continue
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
    return { res: 'success', msg: `successfully added file to ${workEntities.length} tasks` }

}
