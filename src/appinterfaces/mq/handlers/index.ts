/**
 * Message Queue Handlers
 */
export { onMaxRetryReached, onJobMsgFuncMissing } from './abnormal'




export const onMessageQueueConnect = async () => {
    // TODO - confirm if extra action should be taken
    // console.log('Message Queue connected!')

}




export const onMessageQueueClose = () => {
    // TODO - confirm if extra action should be taken
    // console.log('closed Message Queue connection!')
}
