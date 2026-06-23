/**
 * App Interface: Message Queue
 * Receiving messages from message queue, processing messages with business logic by calling respective handlers
 */
import { ackMessage, connectMessageQueue, disconnectMessageQueue, nAckMessage, type QueueItem } from "@modules/mq"
import { createStreamGroup } from '@modules/mq'
import { allowConsuming, setAllowConsume, getMessage, delMessage } from '@modules/mq'
import { getJson } from "@modules/cache"
import { onMessageQueueConnect, onMessageQueueClose, onJobMsgFuncMissing, onMaxRetryReached } from "./handlers"
import * as serviceFunctions from '@services'

import type { JobMessage } from "@commontypes/handlerType"
import { onGetJsonError } from "./handlers/abnormal"


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
        let msgResult: QueueItem
        try {
            msgResult = await getMessage(streamKey, { groupName, consumerName }, 5000)
        } catch (e) {
            if (!allowConsuming) break
            console.error('Error getting message:', e)
            continue
        }

        // Handle timeout (null msgResultponse) - just continue the loop
        if (!msgResult || !msgResult[streamKey] || msgResult[streamKey].length === 0) {
            // console.log(__filename, '\ngetMessage(), msgResult is null')
            continue
        }

        console.log(__filename, '\ngetMessage(), msgResult: ', msgResult[streamKey].length, '\nmsgResult[key]: ', msgResult[streamKey], '\nmsgResult[key][0][0]:', msgResult[streamKey][0][0], '\nmsgResult[key][0][1]: ', msgResult[streamKey][0][1])


        // step 2: get actual data according to message payload
        const payload = msgResult[streamKey][0][1][3]
        console.log('   payload: ', payload)

        // jsonResult: (the job message convention)
        // {
        //     name: 'addFileToTask',
        //     createdAt: Date.now(),
        //     retried: 0,
        //     maxRetry: 3,
        //     lastTryAt: Date.now(),
        //     payload: {
        //         fileId,
        //         selectedValues,
        //         userId,
        //     }
        // }
        let jsonResult: JobMessage[]
        try {
            jsonResult = await getJson('jobs:'+payload)
        } catch (e) {
            console.log('Error when getJson(), e: ', e)
            // e: FAILED_GET_JSON
            onGetJsonError(e, payload)
            nAckMessage(streamKey, groupName, 'FATAL', [msgResult[streamKey][0][0]])
            continue
        }

        if (jsonResult.length === 0) {
            console.log('couldn\'t find the json record from cache!')
            // entry from message queue doesn't have a matching job message, call handler
            onGetJsonError('JSON_RESULT_EMPTY', payload)
            nAckMessage(streamKey, groupName, 'FATAL', [msgResult[streamKey][0][0]])
            continue
        }

        if (jsonResult.length > 1) {
            onGetJsonError('JSON_RESULT_MULTI', payload)
            nAckMessage(streamKey, groupName, 'FATAL', [msgResult[streamKey][0][0]])
            continue
        }


        // step 3: call handler
        // jsonResult might have multiple items, even though it intended to be only one item.
        // use this for loop going through all items for compatibility purpose.
        // for (const item of jsonResult) {

        //     try {
        //         !item.name ? onJobMsgFuncMissing(item) : null
        //         // retried should less than maxRetry , otherwise push to DLQ
        //         item.name && item.retried < item.maxRetry ? await serviceFunctions[item.name](item.payload) : await onMaxRetryReached(item)
        //     } catch (e) {
        //         console.log()
        //         // Only serviceFunctions throw Error msg here, for the last error handling function.
        //         serviceFunctions.onServiceFunctionFailure(item.payload)
        //         // TODO - should NACK
        //     }

        // }

        // step 3: call handler
        // only one item in jsonResult is acceptble and valid for continue
        let shouldAck: boolean = false
        try {
            !jsonResult[0].name ? onJobMsgFuncMissing(jsonResult[0]) : null
            // retried should less than maxRetry , otherwise push to DLQ
            jsonResult[0].name && jsonResult[0].retried < jsonResult[0].maxRetry ? shouldAck = await serviceFunctions[jsonResult[0].name](jsonResult[0].payload) : await onMaxRetryReached(jsonResult[0])
        } catch (e) {
            console.log()
            // Only serviceFunctions throw Error msg here, for the last error handling function.
            serviceFunctions.onServiceFunctionFailure(jsonResult[0].payload)
            // NACK
            nAckMessage(streamKey, groupName, 'SILENT', [msgResult[streamKey][0][0]])
            continue
        }


        // step 4: Acknowlege Message has been processed
        shouldAck ? await ackMessage(streamKey, groupName, msgResult[streamKey][0][0]) : null


    }


    // finished while loop, should indicate explicitly
    console.log('Stopped listening message queue: ', streamKey)


}
