import type { ResponseName } from '@commontypes/messageType'
import type { TaskResponsePayload } from '@commontypes/taskType'

// Share the task service result type
export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    responseName?: ResponseName,
    payload?: TaskResponsePayload,
    next?: 'retry' | 'notify'
}

export { addFileToTask } from './addFileToTask'
export { createTask } from './createTask'
export { reviewTask } from './reviewTask'
export { updateTask } from './updateTask'
