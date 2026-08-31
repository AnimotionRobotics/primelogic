/**
 * @module src/modules/cache
 * using BUN included redis module for redis cache operations
 * https://bun.com/docs/runtime/redis#getting-started
 */
import { RedisClient } from 'bun'


export let cacheClient: RedisClient | null = null


// Initialize Redis client
export const connectCache = async (connString: string, handlers: { onCacheConnect?: () => void, onCacheClose?: (error: Error) => void }) => {

	if (!connString) throw 'MISSING_CONNECTION_STRING'
	if (!handlers) throw 'MISSING_HANDLERS_OBJECT'
	if (typeof handlers !== 'object') throw 'HANDLERS_MUST_BE_OBJECT'
	if (handlers.onCacheConnect && typeof handlers.onCacheConnect !== 'function') throw 'ON_CACHE_CONNECT_MUST_BE_FUNCTION'
	if (handlers.onCacheClose && typeof handlers.onCacheClose !== 'function') throw 'ON_CACHE_CLOSE_MUST_BE_FUNCTION'

	cacheClient = new RedisClient(connString)

	// Add the connect handler when provided
	if (handlers.onCacheConnect) {
		cacheClient.onconnect = handlers.onCacheConnect
	}

	// Add the close handler when provided
	if (handlers.onCacheClose) {
		cacheClient.onclose = handlers.onCacheClose
	}

	try {
		await cacheClient.connect()
	} catch(err) {
		throw 'CACHE_CONNECT_FAILED'
	}

	return cacheClient

}




// Disconnect Redis client
export const disconnectCache = async () => {

	if (!cacheClient) return

	try {
		cacheClient.close()
		cacheClient = null
	} catch (err) {
		throw 'CACHE_DISCONNECT_FAILED'
	}

}




// Set string value to cache
export const setString = async (key: string, value: string, expirySeconds?: number) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (typeof value !== 'string') throw 'CACHE_VALUE_MUST_BE_STRING'

	try {
		if (expirySeconds) {
			await cacheClient.setex(key, expirySeconds, value)
		} else {
			await cacheClient.set(key, value)
		}
	} catch (err) {
		throw 'SET_STRING_FAILED'
	}

}




// Get string value from cache
export const getString = async (key: string): Promise<string | null> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let value: string | null
	try {
		value = await cacheClient.get(key)
	} catch (err) {
		throw 'GET_STRING_FAILED'
	}

	return value

}



// Delete a key from cache
export const deleteKey = async (key: string) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	try {
		await cacheClient.del(key)
	} catch (err) {
		throw 'DELETE_KEY_FAILED'
	}

}




// Check if a key exists in cache
export const existsKey = async (key: string): Promise<boolean> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let exists: boolean
	try {
		exists = await cacheClient.exists(key)
	} catch (err) {
		throw 'CHECK_KEY_EXISTS_FAILED'
	}

	if (typeof exists !== 'boolean') throw 'INVALID_EXISTS_RESULT'

	return exists

}




// Increment a numeric value by 1
export const incrementNumber = async (key: string): Promise<number> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let newValue: number
	try {
		newValue = await cacheClient.incr(key)
	} catch (err) {
		throw 'INCREMENT_NUMBER_FAILED'
	}

	if (typeof newValue !== 'number') throw 'INVALID_INCREMENT_RESULT'

	return newValue

}




// Decrement a numeric value by 1
export const decrementNumber = async (key: string): Promise<number> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let newValue: number
	try {
		newValue = await cacheClient.decr(key)
	} catch (err) {
		throw 'DECREMENT_NUMBER_FAILED'
	}

	if (typeof newValue !== 'number') throw 'INVALID_DECREMENT_RESULT'

	return newValue

}




// Set multiple fields in a hash
export const setHash = async (key: string, hashRecord: Record<string, string>) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!hashRecord || typeof hashRecord !== 'object') throw 'HASH_FIELDS_REQUIRED'

	const hashFields: string[] = []
	for (const [field, value] of Object.entries(hashRecord)) {
		hashFields.push(field, value)
	}

	try {
		await cacheClient.hmset(key, hashFields)
	} catch (err) {
		throw 'SET_HASH_FAILED'
	}

}




// Get a single field from hash
export const getHashField = async (key: string, field: string): Promise<string | null> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!field) throw 'HASH_FIELD_REQUIRED'
	if (typeof field !== 'string') throw 'HASH_FIELD_MUST_BE_STRING'

	let value: string | null
	try {
		value = await cacheClient.hget(key, field)
	} catch (err) {
        console.log(__filename, 'cacheClient.hget(), err: ', err)
		throw 'GET_HASH_FIELD_FAILED'
	}

	return value

}




// Get multiple fields from hash
export const getHashFields = async (key: string, fieldNames: string[]): Promise<(string | null)[]> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!fieldNames || !Array.isArray(fieldNames)) throw 'HASH_FIELDS_REQUIRED'

	let values: (string | null)[]
	try {
		values = await cacheClient.hmget(key, fieldNames)
	} catch (err) {
		throw 'GET_HASH_FIELDS_FAILED'
	}

	if (!Array.isArray(values)) throw 'INVALID_HASH_FIELDS_RESULT'

	return values

}




/**
 *
 */
export const getHashAllFields = async (key: string) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
    if (!key) throw 'MISSING_PARAMETER_KEY'

    let hashRecord
    try {
        hashRecord = await cacheClient.hgetall(key)
    }catch(e){
        console.error('Error cacheClient.hgetall(), e: ', e)
        throw 'ERROR_GET_ALL_HASH_FIELDS'
    }

    if (Object.keys(hashRecord).length === 0) throw 'NO_RECORD_FOUND'

    return hashRecord

}




// Increment a numeric field in a hash
export const incrementHashField = async (key: string, field: string, increment: number = 1): Promise<number> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!field) throw 'HASH_FIELD_REQUIRED'
	if (typeof field !== 'string') throw 'HASH_FIELD_MUST_BE_STRING'
	if (typeof increment !== 'number') throw 'INCREMENT_MUST_BE_NUMBER'

	let newValue: number
	try {
		newValue = await cacheClient.hincrby(key, field, increment)
	} catch (err) {
		throw 'INCREMENT_HASH_FIELD_FAILED'
	}

	if (typeof newValue !== 'number') throw 'INVALID_INCREMENT_HASH_RESULT'

	return newValue

}




// Add member to set
export const addSetMember = async (key: string, member: string) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!member) throw 'SET_MEMBER_REQUIRED'
	if (typeof member !== 'string') throw 'SET_MEMBER_MUST_BE_STRING'

	try {
		await cacheClient.sadd(key, member)
	} catch (err) {
		throw 'ADD_SET_MEMBER_FAILED'
	}

}




// Remove member from set
export const removeSetMember = async (key: string, member: string) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!member) throw 'SET_MEMBER_REQUIRED'
	if (typeof member !== 'string') throw 'SET_MEMBER_MUST_BE_STRING'

	try {
		await cacheClient.srem(key, member)
	} catch (err) {
		throw 'REMOVE_SET_MEMBER_FAILED'
	}

}




// Check if member exists in set
export const isSetMember = async (key: string, member: string): Promise<boolean> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!member) throw 'SET_MEMBER_REQUIRED'
	if (typeof member !== 'string') throw 'SET_MEMBER_MUST_BE_STRING'

	let isMember: boolean
	try {
		isMember = await cacheClient.sismember(key, member)
	} catch (err) {
		throw 'CHECK_SET_MEMBER_FAILED'
	}

	if (typeof isMember !== 'boolean') throw 'INVALID_SET_MEMBER_RESULT'

	return isMember

}




// Get all members of a set
export const getSetMembers = async (key: string): Promise<string[]> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let members: string[]
	try {
		members = await cacheClient.smembers(key)
	} catch (err) {
		throw 'GET_SET_MEMBERS_FAILED'
	}

	if (!Array.isArray(members)) throw 'INVALID_SET_MEMBERS_RESULT'

	return members

}




// Get a random member from set
export const getRandomSetMember = async (key: string): Promise<string | null> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let member: string | null
	try {
		member = await cacheClient.srandmember(key)
	} catch (err) {
		throw 'GET_RANDOM_SET_MEMBER_FAILED'
	}

	return member

}




// Pop (remove and return) a random member from set
export const popSetMember = async (key: string): Promise<string | null> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'

	let member: string | null
	try {
		member = await cacheClient.spop(key)
	} catch (err) {
		throw 'POP_SET_MEMBER_FAILED'
	}

	return member

}




// Store Data in JSON format
export const setJson = async (key: string, data: object, path?: string) => {

    //check if data is valid
	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
    if (!key) throw 'MISSING_PARAMETER:KEY'
    if (!data) throw 'MISSING_PARAMETER:DATA'
    if (typeof key !== 'string') throw 'INVALID_PARAMETER:KEY'
    if (typeof data !== 'object') throw 'INVLIAD_PARAMETER:DATA'

    let queryPath = path || '$'

    let res
    try {
        res = await cacheClient.send('JSON.SET', [key, queryPath, JSON.stringify(data)])
    } catch (e) {
        console.error('Error when saveJson(), JSON.SET error: ', e)
        throw 'FAILED_SAVE_JSON'
    }

    console.log('saveJson(), success! res: ', res)
    return

}




/**
 * Get Json Data
 */
export const getJson = async (key: string, path?: string) => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
    if (!key) throw 'MISSING_PARAMETER:KEY'

    let queryPath = path || '$'

    let res
    try {
        res = await cacheClient.send('JSON.GET', [key, queryPath])
    } catch (e) {
        console.error('Error when getJson(), JSON.GET e: ', e)
        throw 'FAILED_GET_JSON'
    }

    console.log('getJson(), success!', res)

    return res

}

// Delete multiple fields from a hash
export const deleteHashFields  = async (key: string, fieldNames:string[]): Promise<void> => {
	if (!cacheClient) {
		throw 'CACHE_CLIENT_NOT_INITIALIZED'
	}

	if (!key) {
		throw 'CACHE_KEY_REQUIRED'
	}

	if (!Array.isArray(fieldNames) || fieldNames.length ===0) {
		throw 'HASH_FIELDS_REQUIRED'
	}

	try {
		// HDEL requires one field first, then accepts any remaining fields
		await cacheClient.hdel(key, fieldNames[0], ...fieldNames.slice(1))
	} catch {
		throw 'DELETE_HASH_FIELDS_FAILED'
	}
}




// Add one member to a sorted set with its score
export const addSortedSetMember = async (key: string, score: number, member: string): Promise<void> => {

	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (!Number.isFinite(score)) throw 'SORTED_SET_SCORE_MUST_BE_FINITE_NUMBER'
	if (!member) throw 'SORTED_SET_MEMBER_REQUIRED'
	if (typeof member !== 'string') throw 'SORTED_SET_MEMBER_MUST_BE_STRING'

	try {
		await cacheClient.zadd(key, score, member)
	} catch (error) {
		throw 'ADD_SORTED_SET_MEMBER_FAILED'
	}
}




// Get sorted set members within an optional score range, newest first
export const getSortedSetMembers = async (key: string, scoreFrom?: number, scoreTo?: number): Promise<string[]> => {
	if (!cacheClient) throw 'CACHE_CLIENT_NOT_INITIALIZED'
	if (!key) throw 'CACHE_KEY_REQUIRED'
	if (typeof key !== 'string') throw 'CACHE_KEY_MUST_BE_STRING'
	if (scoreFrom !== undefined && !Number.isFinite(scoreFrom)) throw 'SORTED_SET_SCORE_FROM_MUST_BE_FINITE_NUMBER'
	if (scoreTo !== undefined && !Number.isFinite(scoreTo)) throw 'SORTED_SET_SCORE_TO_MUST_BE_FINITE_NUMBER'
	if (scoreFrom !== undefined && scoreTo !== undefined && scoreFrom > scoreTo) throw 'INVALID_SORTED_SET_SCORE_RANGE'

	const minScore = scoreFrom ?? '-inf'
	const maxScore = scoreTo ?? '+inf'

	let members: string[]
	try {
		// REV requires the maximum score before the minimum score, return the result by score from high to low
		members = await cacheClient.zrange(key, maxScore, minScore, 'BYSCORE', 'REV')
	} catch (error) {
		throw 'GET_SORTED_SET_MEMBERS_FAILED'
	}

	if (!Array.isArray(members)) {
		throw 'INVALID_SORTED_SET_MEMBERS_RESULT'

	}

	return members
}
