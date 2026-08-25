/**
 * Message Queue Implementation with Redis Stream
 * @author JiangRui
 * @date 5 June 2026
 */
import { RedisClient } from 'bun'
import { supportedJobNames } from '@commontypes/messageType'
import type { ConsumedJobMessage, JobName, JobPayload } from '@commontypes/messageType'

export let allowConsuming: boolean = false
export let messageQueueClient: RedisClient | null = null
export const targetQueueNamesArray = []
export const listenQueueNamesArray = []




/**
 * Initialize redis client and connect to Redis server
 * @returns RedisClient
 * @throws  string  MISSING_CONNECTION_STRING
 * @throws  string  MISSING_HANDLERS_OBJECT
 * @throws  string  HANDLERS_MUST_BE_OBJECT
 * @throws  string  ON_MESSAGEQUEUE_CONNECT_MUST_BE_FUNCTION
 * @throws  string  ON_MESSAGEQUEUE_CLOSE_MUST_BE_FUNCTION
 * @throws  string  MESSAGEQUEUE_CONNECT_FAILED
 */
export const connectMessageQueue = async (connString: string, handlers: { onMessageQueueConnect?: () => void, onMessageQueueClose?: (e: Error) => void }): Promise<RedisClient> => {

   	if (!connString) throw 'MISSING_CONNECTION_STRING'
	if (!handlers) throw 'MISSING_HANDLERS_OBJECT'
	if (typeof handlers !== 'object') throw 'HANDLERS_MUST_BE_OBJECT'
	if (handlers.onMessageQueueConnect && typeof handlers.onMessageQueueConnect !== 'function') throw 'ON_MESSAGEQUEUE_CONNECT_MUST_BE_FUNCTION'
    if (handlers.onMessageQueueClose && typeof handlers.onMessageQueueClose !== 'function') throw 'ON_MESSAGEQUEUE_CLOSE_MUST_BE_FUNCTION'

    messageQueueClient = new RedisClient(connString)
    // Attach event handlers
    messageQueueClient.onconnect = handlers.onMessageQueueConnect
    messageQueueClient.onclose = handlers.onMessageQueueClose

    try {
        await messageQueueClient.connect()
    } catch (e) {
        throw 'MESSAGEQUEUE_CONNECT_FAILED'
    }


    return messageQueueClient

}




/**
 * Disconnect Redis Client from Redis Server
 */
export const disconnectMessageQueue = async (): Promise<string> => {

    if (!messageQueueClient) return 'done'
    allowConsuming = false

    try {
        messageQueueClient.close()
        messageQueueClient = null
    } catch (e) {
        console.log(__filename, '\nmessageQueueClient.close(), e: ', e)
        if (e.code === "ERR_REDIS_CONNECTION_CLOSED") {
            console.log('Redis connection already closed during disconnect, ignoring.')
            return 'done' // Treat as successful disconnection
        }
        throw 'MESSAGEQUEUE_DISCONNECT_FAILED'
    }


    // console.log('disconnectMessageQueue() allowConsuming: ', allowConsuming)

    return 'done'

}




/**
 * Initialize Stream and Group
 */
export const createStreamGroup = async (streamKey: string, consumerGroupName: string) => {

    if (!streamKey) throw new Error('No stream name provided!')
    if (!consumerGroupName) throw new Error('No consumer group name provided!')
    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'

    // Check if consumer group already exists using XINFO GROUPS
    let groups
    try {
        groups = await messageQueueClient.send('XINFO', ['GROUPS', streamKey])
    } catch (e: any) {
        // ERR no such key - stream doesn't exist, proceed to create
        if (e.message && e.message.includes('no such key')) {
            groups = null
        } else {
            throw 'ERROR_CHECK_CONSUMER_GROUPS'
        }
    }

    // Check if our consumer group already exists
    let groupExists = false
    if (groups && Array.isArray(groups)) {
        groupExists = groups.some((group: any) => {
            // XINFO GROUPS returns array of arrays: [['name', 'groupName', ...], ...]
            // or array of objects depending on Redis client
            // if (Array.isArray(group)) {
            //     const nameIndex = group.indexOf('name')
            //     return nameIndex !== -1 && group[nameIndex + 1] === consumerGroupName
            // }
            // return group?.name === consumerGroupName
            Array.isArray(group) ?
                groupExists = group.indexOf('name') !== -1 && group[group.indexOf('name') + 1] === consumerGroupName :
                group?.name === consumerGroupName
        })
    }
    if (groupExists) { return }

    try {
        await messageQueueClient.send('XGROUP', [
            'CREATE',
            streamKey, consumerGroupName, '$', 'MKSTREAM'
        ])
        console.log('created: ', streamKey, consumerGroupName)
    } catch (e: any) {
        // Handle race condition where group was created between check and create
        if (e.message && e.message.includes('BUSYGROUP')) {
            return
        }
        throw e
    }

}




/**
 * Add Data to Message Queue
 */
export const dispatchMessage = async (responseStreamKey: string, responseId: string, cacheClient: RedisClient | null, responseMessageFields: string[]): Promise<void> => {

    if (!responseStreamKey) throw 'MISSING_PARAMETER_RESPONSE_STREAM_KEY'
    if (!responseId) throw 'MISSING_PARAMETER_RESPONSE_ID'
    if (!cacheClient) throw 'MISSING_PARAMETER_CACHE_CLIENT'
    if (!Array.isArray(responseMessageFields)) {
        throw 'RESPONSE_MESSAGE_FIELDS_MUST_BE_ARRAY'
    }
    if (responseMessageFields.length === 0 || responseMessageFields.length % 2 !== 0) {
        throw 'INVALID_RESPONSE_MESSAGE_FIELDS'
    }

    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'

    // Save response
    await cacheClient.hmset(`responses:${responseId}`, responseMessageFields)

    // Push response to mq
    await messageQueueClient.send('XADD', [
        responseStreamKey,
        "MAXLEN", "~", "10000", "*",
        "produced_time", Date.now().toString(),
        "payload", responseId
    ])
}




/**
 * Get Message From Redis Stream
 * @param streamKey - The stream key to read from
 * @param config - Consumer group config (groupName, consumerName)
 * @param blockTimeout - Block timeout in milliseconds (default: 5000ms, use 0 for indefinite)
 * @throws NO_MESSAGE_FOUND
 * @throws ERROR_WHEN_GETMESSAGE
 * @throws INVALID_MESSAGE_ID
 * @throws INVALID_STREAM_ENTRY
 * @throws INVALID_STREAM_MESSAGE_ID
 * @throws INVALID_STREAM_FIELDS
 * @throws INVALID_STREAM_FIELD
 * @throws MISSING_JOB_ID
 * @throws JOB_MESSAGE_NOT_FOUND
 * @throws INVALID_JOB_NUMBER_FIELD
 * @throws INVALID_JOB_CREATED_BY
 * @throws INVALID_JOB_NAME
 * @throws INVALID_JOB_PAYLOAD
 * @throws ERROR_GET_QUEUE_ITEM
 * @throws ERROR_WHEN_HGETALL_BY_KEY
 */


export type GetMessageError = {
    code: string
    streamMessageId: string
    jobId?: string
}
export const getMessage = async (streamKey: string, config?: {groupName: string, consumerName: string, claimMinIdleTime: number}, blockTimeout: number = 1000): Promise<ConsumedJobMessage> => {

    let cmd = 'XREAD'
    let params = ['BLOCK', blockTimeout.toString(), 'COUNT', '1', 'STREAMS', streamKey, '0']

    if (config && config.groupName && config.consumerName) {
        cmd = 'XREADGROUP'
        // Use '>' to read only new messages that were never delivered to any consumer
        // CLAIM used for retry when nack
        params = ['GROUP', config.groupName, config.consumerName,
                'BLOCK', blockTimeout.toString(),
                'COUNT', '1',
                'CLAIM', config.claimMinIdleTime.toString(),
                'STREAMS', streamKey,
                '>']
    }

    // console.log('cmd: ', cmd, ' params: ', params)
    if (!allowConsuming) throw 'CONSUME_NOT_ALLOWED'

    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'

    let response
    try {
        // XREADGROUP, the message is added to Pending Entry List (PEL) with delivery count +1
        //  XREAD does not use a consumer-group PEL
        response = await messageQueueClient.send(cmd, params)
    } catch (e) {
        throw 'ERROR_WHEN_GETMESSAGE'
    }

    if (!response) throw 'NO_MESSAGE_FOUND'

    // { "job-queue:jobs:kaidi": [
    //     [ "1786427859403-0", [ "produced_time", "1786427858387", "payload", "7416350627799220233" ] ]
    //   ],
    // }

    const streamEntry = response[streamKey]?.[0]

    if (!streamEntry || !Array.isArray(streamEntry)) throw 'INVALID_STREAM_ENTRY'

    const streamMessageId = streamEntry[0]
    const streamFields = streamEntry[1]

    if (typeof streamMessageId !== 'string') throw 'INVALID_STREAM_MESSAGE_ID'

    if (!Array.isArray(streamFields) || streamFields.length % 2 !== 0) {
        const error: GetMessageError = { code: 'INVALID_STREAM_FIELDS', streamMessageId}
        throw error
    }

    const streamFieldMap: Record<string, string> = {}

    for (let index = 0; index < streamFields.length; index += 2) {
        const fieldName = streamFields[index]
        const fieldValue = streamFields[index + 1]

        if (typeof fieldName !== 'string' || typeof fieldValue !== 'string') {
            const error: GetMessageError = { code: 'INVALID_STREAM_FIELD', streamMessageId}
            throw error
        }

        streamFieldMap[fieldName] = fieldValue
    }

    const jobId = streamFieldMap.payload

    if (!jobId) {
        const error: GetMessageError = { code: 'MISSING_JOB_ID', streamMessageId}
        throw error
    }

    let jobFields: Record<string, string>
    try {
        jobFields = await messageQueueClient.hgetall(`jobs:${jobId}`)
    } catch (e) {
        const error: GetMessageError = { code: 'ERROR_WHEN_HGETALL_BY_KEY', streamMessageId, jobId}
        throw error
    }

    if (Object.keys(jobFields).length === 0) {
        const error: GetMessageError = { code: 'JOB_MESSAGE_NOT_FOUND', streamMessageId, jobId}
        throw error
    }

    const createdAt = Number(jobFields.createdAt)
    const retried = Number(jobFields.retried)
    const maxRetry = Number(jobFields.maxRetry)
    const lastTriedAt = Number(jobFields.lastTriedAt)

    if (!Number.isFinite(createdAt) || !Number.isFinite(retried) || !Number.isFinite(maxRetry) || !Number.isFinite(lastTriedAt)) {
        const error: GetMessageError = { code: 'INVALID_JOB_NUMBER_FIELD', streamMessageId, jobId}
        throw error
    }

    const createdBy = jobFields.createdBy

    if (typeof createdBy !== 'string' || createdBy.trim().length === 0) {
        const error: GetMessageError = { code: 'INVALID_JOB_CREATED_BY', streamMessageId,jobId}
        throw error
    }

    if (!supportedJobNames.includes(jobFields.name as JobName)) {
        const error: GetMessageError = { code: 'INVALID_JOB_NAME', streamMessageId, jobId}
        throw error
    }

    let payload: JobPayload

    try {
        payload = JSON.parse(jobFields.payload) as JobPayload
    } catch (e) {
        const error: GetMessageError = { code: 'INVALID_JOB_PAYLOAD', streamMessageId, jobId}
        throw error
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const error: GetMessageError = { code: 'INVALID_JOB_PAYLOAD', streamMessageId, jobId}
        throw error
    }

    return {
        streamMessageId,
        jobId,
        name: jobFields.name as JobName,
        createdAt,
        createdBy,
        retried,
        maxRetry,
        lastTriedAt,
        payload
    }
}




/**
 * Ack message in consumer group
 */
export const ackMessage = async (streamKey: string, groupName: string, messageId: string, del?: boolean) : Promise<number> => {

    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'
    if (!streamKey) throw 'MISSING_PARAMETER_STREAM_KEY'
    if (!groupName) throw 'MISSING_PARAMETER_GROUP_NAME'
    if (!messageId) throw 'MISSING_PARAMETER_MESSAGE_ID'

    let cmd = del ? 'XACKDEL' : 'XACK'
    let params = del ? [streamKey, groupName, 'KEEPREF', 'IDS', '1', messageId] : [streamKey, groupName, messageId]

    let res: number
    try {
        res = await messageQueueClient.send(cmd, params)
    } catch (e) {
        throw 'ERROR_ACK_MESSAGE'
    }

    if (typeof res !== 'number') throw 'FAILED_ACK_MESSAGE'

    return res

}




/**
 * NACK message
 * Relase message from PEL , make this message consumable again
 * mode:
 *  SILENT: Decrements the delivery counter by 1, essentially "undoing" the delivery increment. Use this for an internal failure on the consumer side while processing the message or graceful shutdown where the delivery "didn't count".
 *  FAIL: Keeps the current delivery counter value unchanged. Use this when the current consumer failed to process this message (for example, due to memory constraints). The root cause may be the message or the consumer (it is unclear), so the best strategy would be to let another consumer try to process the message.
 *  FATAL: Sets the delivery counter to the maximum value (LLONG_MAX or ~9.22 X 1018), marking the message as permanently failed. Use this for invalid or suspected malicious messages.
 */
export const nAckMessage = async (streamKey: string, groupName: string, mode: 'SILENT' | 'FAIL' | 'FATAL', messageIds: string[]) => {

    if (!streamKey) throw 'MISSING_PARAMETER_STREAMKEY'
    if (!groupName) throw 'MISSING_PARAMETER_GROUPNAME'
    if (!messageIds||!Array.isArray(messageIds) || messageIds.length === 0) throw 'MISSING_PARAMETER_MESSAGEIDS'
    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'

    try {
        await messageQueueClient.send('XNACK', [streamKey, groupName, mode, 'IDS', messageIds.length.toString(), ...messageIds])
    } catch (e) {
        throw 'ERROR_NACK_MESSAGE'
    }

    return true

}




/**
 * Delete Message From Redis Stream
 */
export const delMessage = async (key:string, id:string) => {

    if (!key) throw 'MISSING_PARAMETER_KEY'
    if (!id) throw 'MISSING_PARAMETER_ID'
    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'

    console.log(__filename, '\nkey: ', key, '   id: ', id)

    try {
        await messageQueueClient.send('XDEL', [key, id])
    } catch (e) {
        console.error('Error when XDEL, e: ', e)
        throw 'ERROR_DEL_MESSAGE'
    }

}




/**
 * Set Allow Consuming Status
 */
export const setAllowConsume = async (allow: boolean) => {

    allowConsuming = allow

}


// for DLQ or simple stream append
export const appendStreamMessage = async (streamKey: string, fields: string[]): Promise<string> => {
    if (!messageQueueClient) throw 'MESSAGE_QUEUE_CLIENT_NOT_INITIALIZED'
    if (!streamKey) throw 'MISSING_PARAMETER_STREAMKEY'
    if (!fields || fields.length === 0) throw 'MISSING_PARAMETER_FIELDS'
    if (fields.length % 2 !== 0) throw 'INVALID_STREAM_FIELDS'

    let streamMessageId: string
    try {
        streamMessageId = await messageQueueClient.send('XADD', [
            streamKey,
            'MAXLEN', '~', '10000',
            '*',
            ...fields
        ])
    } catch (e) {
        throw 'FAILED_APPEND_STREAM_MESSAGE'
    }

    if (typeof streamMessageId !== 'string') {
        throw 'INVALID_STREAM_MESSAGE_ID'
    }

    return streamMessageId
}
