/**
 * Message Queue Handlers
 */
export { onGetMessageError, onMaxRetryReached, onJobMsgNameMissing } from './abnormal'
export { getMessageFromMq } from './getMessageFromMq'
export type { MessageQueueConsumerConfig } from './getMessageFromMq'
export { callServiceForJobMessage } from './callServiceForJobMessage'
export { dispatchServiceResultToMq } from './dispatchServiceResultToMq'




export const onMessageQueueConnect = async (): Promise<void> => {
    // TODO - confirm if extra action should be taken
    // console.log('Message Queue connected!')

}




export const onMessageQueueClose = (): void => {
    // TODO - confirm if extra action should be taken
    // console.log('closed Message Queue connection!')
}
