
// Job Message, the message stored in message queue for inter service
// export type JobMessage = {
//     id: string
//     name: string
//     createdAt: number
//     retried: number
//     maxRetry: number
//     lastTryAt: number
//     payload: any
// }

import type { TaskResponsePayload } from "@commontypes/taskType"
import type { ResponseName } from '@commontypes/messageType'

export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    responseName?:ResponseName
    payload?: TaskResponsePayload,
    next?: 'retry' | 'notify'
}
