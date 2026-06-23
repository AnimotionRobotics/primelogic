/**
 * @module src/modules/messenger
 * using BUN included redis module for redis pub/sub operations
 * https://bun.com/docs/runtime/redis#pub%2Fsub
 */
import { RedisClient } from 'bun'


export let publisherClient: RedisClient | null = null
export let subscriberClient: RedisClient | null = null


// Initialize Redis clients for pub/sub
export const connectMessenger = async (connString: string, handlers: { onMessengerConnect?: () => void, onMessengerClose?: (error: Error) => void }) => {

	if (!connString) throw 'MISSING_CONNECTION_STRING'
	if (typeof connString !== 'string') throw 'CONNECTION_STRING_MUST_BE_STRING'
	if (!handlers) throw 'MISSING_HANDLERS_OBJECT'
	if (typeof handlers !== 'object') throw 'HANDLERS_MUST_BE_OBJECT'
	if (handlers.onMessengerConnect && typeof handlers.onMessengerConnect !== 'function') throw 'ON_MESSENGER_CONNECT_MUST_BE_FUNCTION'
	if (handlers.onMessengerClose && typeof handlers.onMessengerClose !== 'function') throw 'ON_MESSENGER_CLOSE_MUST_BE_FUNCTION'

	try {
        publisherClient = new RedisClient(connString)
    	publisherClient.onconnect = handlers.onMessengerConnect || null
    	publisherClient.onclose = handlers.onMessengerClose || null
		await publisherClient.connect()

        subscriberClient = new RedisClient(connString)
    	subscriberClient.onconnect = handlers.onMessengerConnect || null
    	subscriberClient.onclose = handlers.onMessengerClose || null
		await subscriberClient.connect()
	} catch (err) {
		throw 'MESSENGER_CONNECT_FAILED'
	}

	if (!publisherClient || !subscriberClient) throw 'MESSENGER_CLIENT_INITIALIZATION_FAILED'



	return { publisherClient, subscriberClient }

}




// Disconnect Redis clients
export const disconnectMessenger = async () => {

	if (!publisherClient && !subscriberClient) return

	try {
		if (publisherClient) {
			publisherClient.close()
			publisherClient = null
		}
		if (subscriberClient) {
			subscriberClient.close()
			subscriberClient = null
		}
	} catch (err) {
		throw 'MESSENGER_DISCONNECT_FAILED'
	}

}




// Publish message to a channel
export const publishMessage = async (channel: string, message: string) => {

	if (!publisherClient) throw 'PUBLISHER_CLIENT_NOT_INITIALIZED'
	if (!channel) throw 'CHANNEL_REQUIRED'
	if (typeof channel !== 'string') throw 'CHANNEL_MUST_BE_STRING'
	if (!message) throw 'MESSAGE_REQUIRED'
	if (typeof message !== 'string') throw 'MESSAGE_MUST_BE_STRING'

	try {
		await publisherClient.publish(channel, message)
	} catch (err) {
		throw 'PUBLISH_MESSAGE_FAILED'
	}

}




// Subscribe to multiple channels
export const subscribeChannels = async (channels: string[], callback: (message: string, channel: string) => void) => {

	if (!subscriberClient) throw 'SUBSCRIBER_CLIENT_NOT_INITIALIZED'
	if (!channels) throw 'CHANNELS_REQUIRED'
	if (!Array.isArray(channels)) throw 'CHANNELS_MUST_BE_ARRAY'
	if (channels.length === 0) throw 'CHANNELS_ARRAY_EMPTY'
	if (!callback) throw 'CALLBACK_REQUIRED'
	if (typeof callback !== 'function') throw 'CALLBACK_MUST_BE_FUNCTION'

	try {
		for (const channel of channels) {
			if (!channel || typeof channel !== 'string') throw 'INVALID_CHANNEL_IN_ARRAY'
			await subscriberClient.subscribe(channel, callback)
		}
	} catch (err) {
		throw 'SUBSCRIBE_CHANNELS_FAILED'
	}

}




// Unsubscribe from all channels
export const unsubscribeAll = async () => {

	if (!subscriberClient) throw 'SUBSCRIBER_CLIENT_NOT_INITIALIZED'

	try {
		await subscriberClient.unsubscribe()
	} catch (err) {
		throw 'UNSUBSCRIBE_ALL_FAILED'
	}

}




// Unsubscribe from specific channel
export const unsubscribeChannel = async (channel: string) => {

	if (!subscriberClient) throw 'SUBSCRIBER_CLIENT_NOT_INITIALIZED'
	if (!channel) throw 'CHANNEL_REQUIRED'
	if (typeof channel !== 'string') throw 'CHANNEL_MUST_BE_STRING'

	try {
		await subscriberClient.unsubscribe(channel)
	} catch (err) {
		throw 'UNSUBSCRIBE_CHANNEL_FAILED'
	}

}
