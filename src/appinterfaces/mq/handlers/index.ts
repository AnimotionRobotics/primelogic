/**
 * Message Queue Handlers
 */
import { setAllowConsume } from '@modules/mq'

export { onGetMessageError, onMaxRetryReached, onJobMsgNameMissing } from './abnormal'
export { onGetMessage, onCallService, onDispatchResponse } from './consumption'
export type { MessageQueueConsumerConfig } from './consumption'




export const onMessageQueueConnect = async (): Promise<void> => {
    // TODO - confirm if extra action should be taken
    // console.log('Message Queue connected!')

}




export const onMessageQueueClose = async (): Promise<void> => {
    await setAllowConsume(false)
}
