
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


export type HandlerResult = {
    res: 'success' | 'fail' | 'error',
    msg: string,
    next?: 'retry' | 'notify'
}
