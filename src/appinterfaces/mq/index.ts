/**
 * App Interface: Message Queue
 * Receiving messages from message queue, processing messages with business logic by calling respective handlers
 */
import type { JobMessage } from "@modules/mq"
import { ackMessage, connectMessageQueue, disconnectMessageQueue, nAckMessage } from "@modules/mq"
import { createStreamGroup } from '@modules/mq'
import { allowConsuming, setAllowConsume, getMessage, delMessage } from '@modules/mq'
// import { publishMessage } from '@modules/messenger'
import { onMessageQueueConnect, onMessageQueueClose, onJobMsgNameMissing, onMaxRetryReached,onGetMessageError } from "./handlers"
import { serviceRoute, onServiceFunctionFailure, type ServiceCallResult } from '@services'




export { disconnectMessageQueue, setAllowConsume }




 /**
  * Initialize Message Queue
  */
export const initMessageQueue = async (redisConnectionString: string, config: {targetStreamKey: string, targetStreamConsumerGroup: string, listenStreamKey: string, listenStreamConsumerGroup: string}) => {

    // step 1: connect to redis server
    try {
        await connectMessageQueue(redisConnectionString, { onMessageQueueConnect, onMessageQueueClose })
        setAllowConsume(true)
        // console.log('set setAllowConsume', true)
    } catch (e) {
        console.error('Failed connect to message queue')
        process.exit(1)
    }


    // step 2: prepare stream with consumer group
    try {
        await createStreamGroup(config.targetStreamKey, config.targetStreamConsumerGroup)
        await createStreamGroup(config.listenStreamKey, config.listenStreamConsumerGroup)
    } catch (e: any) {
        if (e.message && e.message.includes('BUSYGROUP Consumer Group name already exists')) {
            console.log('Consumer Group name already exists')
        } else {
            console.error('Error when createStreamGroup()', e)
        }
    }



}




/**
 * Start Consuming Message Queue
 * Since it is using blocking listening, this process should be the last one of Initialize process in top level script
 */
export const initConsumingMessageQueue = async (streamKey: string, groupName: string, consumerName: string) => {


    console.log('Now listening message queue: ', streamKey)
    while (allowConsuming) {

        // step 1: get queued message
        let msgResult: JobMessage
        try {
            msgResult = await getMessage(streamKey, { groupName, consumerName }, 5000)
            // msgResult ? console.log(__filename, '\ngetMessage(), msgResult: ', msgResult) : null
        } catch (e) {
            // if (!allowConsuming) break
            if (e === 'CONSUME_NOT_ALLOWED') break
            if (e === 'NO_MESSAGE_FOUND') continue
            // if this error is critical, entire loop should be terminated (break)
            if (onGetMessageError(e, streamKey, groupName, consumerName)) break
            continue
        }

        // console.log(__filename, '\ngetMessage(), msgResult: ', msgResult)



        // step 2: call handler
        // only one item in jsonResult is acceptble and valid for continue
        let serviceResult: ServiceCallResult 
        try {
            !msgResult.name ? serviceResult = onJobMsgNameMissing(msgResult) : null
            // retried should less than maxRetry , otherwise push to DLQ
            msgResult.name && msgResult.retried < msgResult.maxRetry ? 
                serviceResult = await serviceRoute(msgResult.name, msgResult.payload) : 
                serviceResult = await onMaxRetryReached(msgResult)
        } catch (e) {
            console.log('handler emit error, e: ', e)
            // Only serviceFunctions throw Error msg here, for the last error handling function.
            onServiceFunctionFailure(msgResult.payload)
            // TODO - e ? onServiceFunctionFailure() : otherFailure()
            // TODO - add handler (otherFailure()) for error emit from onJobMsgNameMissing(), onMaxRetryReached()

            // NACK
            nAckMessage(streamKey, groupName, 'SILENT', [msgResult.id])
            continue
        }


        // step 3: push result back to message queue
        try {
            await dispathMessage('job-response:'+msgResult.createdBy, msgResult.id, cacheClient, serviceResult.msg)
        }catch(e){
            // TODO - dispathMessage failure, should retry or push to DLQ
        }

        

        // step 4: Acknowlege Message which has been processed according to result
        serviceResult.ack ? await ackMessage(streamKey, groupName, msgResult.id) : null
        // TODO - what if ackMessage error ?




    }


    // finished while loop, should indicate explicitly
    console.log('Stopped listening message queue: ', streamKey)


}
