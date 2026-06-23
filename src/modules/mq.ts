/**
 * Message Queue Implementation with Redis Stream
 * @author JiangRui
 * @date 5 June 2026
 */
import { RedisClient } from 'bun'


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
 * @throws  string  ON_CACHE_CONNECT_MUST_BE_FUNCTION
 * @throws  string  ON_CACHE_CLOSE_MUST_BE_FUNCTION
 * @throws  string  MESSAGEQUEUE_CONNECT_FAILED
 */
export const connectMessageQueue = async (connString: string, handlers: { onMessageQueueConnect?: () => void, onMessageQueueClose?: (e: Error) => void }): Promise<RedisClient> => {

   	if (!connString) throw 'MISSING_CONNECTION_STRING'
	if (!handlers) throw 'MISSING_HANDLERS_OBJECT'
	if (typeof handlers !== 'object') throw 'HANDLERS_MUST_BE_OBJECT'
	if (handlers.onMessageQueueConnect && typeof handlers.onMessageQueueConnect !== 'function') throw 'ON_CACHE_CONNECT_MUST_BE_FUNCTION'
    if (handlers.onMessageQueueClose && typeof handlers.onMessageQueueClose !== 'function') throw 'ON_CACHE_CLOSE_MUST_BE_FUNCTION'

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
export type JobObject = { name: string, createdAt: number, retried: number, maxRetry: number, lastTryAt: number, payload: object }
export const dispatchMessage = async (streamKey: string, jobId: any, client: RedisClient, jobObj: JobObject) => {

    if (!streamKey) throw 'MISSING_PARAMETER_STREAMKEY'
    if (!jobId) throw 'MISSING_PARAMETER_JOBID'
    if (!client) throw 'MISSING_PARAMETER_CLIENT'
    console.log(__filename, '\nstreamKey: ', streamKey, '\njobId: ',jobId)

    // add jobId to store.
    let res
    try {
        res = await client.send('JSON.SET', ['jobs:'+jobId, '$', JSON.stringify(jobObj)])
    } catch (e) {
        console.error(e)
        throw 'ERROR_SEND_JSON.SET'
    }


    // add to message queue
    try {
        await messageQueueClient.send('XADD', [
            streamKey,
            "MAXLEN", "~", "10000", "*",
            "produced_time", Date.now().toString(),
            "payload", jobId
        ])
    } catch (e) {
        console.error('Failed to dispatch to redis stream, e: ', e)
        throw 'FAILED_DISPATCH_MESSAGE'
    }

    return

}




/**
 * Get Message From Redis Stream
 * @param streamKey - The stream key to read from
 * @param config - Consumer group config (groupName, consumerName)
 * @param blockTimeout - Block timeout in milliseconds (default: 5000ms, use 0 for indefinite)
 */
export type QueueItem = string[]
export const getMessage = async (streamKey: string, config?: {groupName: string, consumerName: string}, blockTimeout: number = 1000): Promise<QueueItem> => {

    if (!allowConsuming) return null

    let cmd = 'XREAD'
    let params = ['BLOCK', blockTimeout.toString(), 'COUNT', '1', 'STREAMS', streamKey, '0']

    if (config && config.groupName && config.consumerName) {
        cmd = 'XREADGROUP'
        // Use '>' to read only new messages that were never delivered to any consumer
        params = ['GROUP', config.groupName, config.consumerName, 'BLOCK', blockTimeout.toString(), 'COUNT', '1', 'STREAMS', streamKey, '>']
    }

    // console.log('cmd: ', cmd, ' params: ', params)

    let response
    try {
        response = await messageQueueClient.send(cmd, params)
    } catch (e) {
        console.error('Error when XREAD, e: ', e)
        throw 'ERROR_WHEN_GETMESSAGE'
    }

    // console.log(__filename, '\ngetMessage(), response: ', response)
    // Response is null when block timeout expires with no messages
    return response

}




/**
 * Acknowledge Message in Consumer Group
 */
export const ackMessage = async (streamKey: string, groupName: string, messageId: string, del?: boolean) => {

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
 * Negatively Acknowledge Message
 * Relase message from PEL , make this message consumable again
 * mode:
 *  SILENT: Decrements the delivery counter by 1, essentially "undoing" the delivery increment. Use this for an internal failure on the consumer side while processing the message or graceful shutdown where the delivery "didn't count".
 *  FAIL: Keeps the current delivery counter value unchanged. Use this when the current consumer failed to process this message (for example, due to memory constraints). The root cause may be the message or the consumer (it is unclear), so the best strategy would be to let another consumer try to process the message.
 *  FATAL: Sets the delivery counter to the maximum value (LLONG_MAX or ~9.22 X 1018), marking the message as permanently failed. Use this for invalid or suspected malicious messages.
 */
export const nAckMessage = async (streamKey: string, groupName: string, mode: 'SILENT' | 'FAIL' | 'FATAL', messageIds: string[]) => {

    if (!streamKey) throw 'MISSING_PARAMETER_STREAMKEY'
    if (!groupName) throw 'MISSING_PARAMETER_GROUPNAME'
    if (!messageIds) throw 'MISSING_PARAMETER_MESSAGEIDS'

    try {
        await messageQueueClient.send('XNACK', [streamKey, groupName, mode, 'IDS', messageIds.length.toString(), ...messageIds])
    } catch (e) {
        throw e
    }

    return true

}




/**
 * Delete Message From Redis Stream
 */
export const delMessage = async (key:string, id:string) => {

    if (!key) throw 'MISSING_PARAMETER_KEY'
    if (!id) throw 'MISSING_PARAMETER_ID'

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
