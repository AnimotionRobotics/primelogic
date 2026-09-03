import type { HandlerResult } from './taskSupport'




const retryableServiceErrorCodes: string[] = [
    'ERROR_GET_ALL_HASH_FIELDS',
    'GET_HASH_FIELD_FAILED',
    'SET_HASH_FAILED',
    'DELETE_HASH_FIELDS_FAILED',
    'INCREMENT_HASH_FIELD_FAILED',
    'ADD_SORTED_SET_MEMBER_FAILED',
    'GET_SORTED_SET_MEMBERS_FAILED'
]

// Convert common retryable dependency errors to a service failure
export const onServiceFunctionFailure = (error: unknown): HandlerResult => {
    if (typeof error === 'string' && retryableServiceErrorCodes.includes(error)) {
        return { res: 'fail', msg: error }
    }

    throw error
}
