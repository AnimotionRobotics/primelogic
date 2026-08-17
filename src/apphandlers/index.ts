/**
 * Top level event handler
 */
import { initMessageQueue, disconnectMessageQueue, setAllowConsume, initConsumingMessageQueue } from "@appinterfaces/mq"
import { connectCache, disconnectCache } from "@modules/cache"
import { connectMessenger, disconnectMessenger } from "@modules/messenger"
import { onCacheConnect, onCacheClose } from "./cache"
import { onMessengerConnect, onMessengerClose } from "./messenger"




/**
 * Start Application
 * handling 'APPSTART' signal
 * this is the very first step of launch this entire service.
 */
export const APP_START_HANDLER = async () => {

    // check redis credentials for cache and messenger and message queue
    if (!process.env.REDIS_URL || !process.env.REDIS_PORT || !process.env.REDIS_PASSWORD) {
        console.error('Missing redis credentials')
        process.exit(1)
    }
    const redisConnectionString = `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_URL}:${process.env.REDIS_PORT}`

    // cache
    console.time('cache')
    try {
        await connectCache(redisConnectionString, {onCacheConnect, onCacheClose})
    } catch (e) {
        console.error('Failed connect to cache server', e)
        process.exit(1)
    }
    console.timeEnd('cache')

    // messenger
    console.time('messenger')
    try {
        await connectMessenger(redisConnectionString, { onMessengerConnect, onMessengerClose })
    } catch(e) {
        console.error('Failed connect to messenger', e)
        process.exit(1)
    }
    console.timeEnd('messenger')


    // message queue
    if (!process.env.MQ_TARGET_STREAM_KEY || !process.env.MQ_TARGET_STREAM_CONSUMER_GROUP) {
        process.emit('APPERROR', { err: 'CRITICAL', msg: 'MQ_TARGET_STREAM_KEY or MQ_TARGET_STREAM_CONSUMER_GROUP not set' })
        process.exit(1)
    }
    if (!process.env.MQ_LISTEN_STREAM_KEY || !process.env.MQ_LISTEN_STREAM_CONSUMER_GROUP) {
        process.emit('APPERROR', { err: 'CRITICAL', msg: 'MQ_LISTEN_STREAM_GROUP or MQ_LISTEN_STREAM_CONSUMER_GROUP not set' })
        process.exit(1)
    }
    console.time('messagequeue')
    try {
        await initMessageQueue(redisConnectionString, {targetStreamKey: process.env.MQ_TARGET_STREAM_KEY, targetStreamConsumerGroup: process.env.MQ_TARGET_STREAM_CONSUMER_GROUP, listenStreamKey: process.env.MQ_LISTEN_STREAM_KEY, listenStreamConsumerGroup: process.env.MQ_LISTEN_STREAM_CONSUMER_GROUP})
    } catch (e) {
        console.error('Failed connect to message queue', e)
        process.exit(1)
    }
    console.timeEnd('messagequeue')


    // start listening and set consumer of message queue
    try {
        await initConsumingMessageQueue(process.env.MQ_LISTEN_STREAM_KEY, process.env.MQ_LISTEN_STREAM_CONSUMER_GROUP, 'slack-msg-consumer-01')
    } catch (e) {
        console.error('initConsumingMessageQueue(), e: ', e)
        process.exit(1)
    }



}




/**
 * App Error Handler
 */
export const APP_ERROR_HANDLER = (err: Error) => {

}




export const SIGINT_HANDLER = async () => {

    console.log(`\n\n${new Date()}\nSIGINT_HANDLER: Gracefully shutting down initiated.`);
    setAllowConsume(false)

    // Wait for in-flight getMessage to complete before disconnecting clients.
    // The delay should be slightly longer than the getMessage blockTimeout.
    console.log('Waiting 5000ms for on-going message queue iteration finish...')
    await new Promise(resolve => setTimeout(resolve, 5000));

    let res
    try {
        res = await Promise.allSettled([
            disconnectCache().finally(() => console.log('SIGINT_HANDLER: disconnectCache finished.')),
            disconnectMessenger().finally(() => console.log('SIGINT_HANDLER: disconnectMessenger finished.')),
            disconnectMessageQueue().finally(()=> console.log('SIGINT_HANDLER: disconnectMessageQueue finished.'))
        ])
    } catch (e) {
        console.error('SIGINT_HANDLER: Shutdown not so Gracefully. Error:', e)
        process.exit(1)
    }

    let exitCode = 0
    for (const item of res) {
        item.status !== 'fulfilled' ? exitCode += 1 : null
    }
    console.log('SIGINT_HANDLER: All shutdown promises settled. exitCode:', exitCode)
    console.log(`SIGINT_HANDLER: Exiting process with code ${exitCode} (0:success).`)
    process.exit(exitCode)

    // Promise.allSettled([
    //     stopSlackApp().finally(() => console.log('SIGINT_HANDLER: stopSlackApp finished.')),
    //     disconnectCache().finally(() => console.log('SIGINT_HANDLER: disconnectCache finished.')),
    //     disconnectMessenger().finally(() => console.log('SIGINT_HANDLER: disconnectMessenger finished.')),
    //     disconnectMessageQueue().finally(()=> console.log('SIGINT_HANDLER: disconnectMessageQueue finished.'))
    // ]).then(res => {

    //     let exitCode = 0
    //     for (const item of res) {
    //         item.status !== 'fulfilled' ? exitCode += 1 : null
    //     }
    //     console.log('SIGINT_HANDLER: All shutdown promises settled. exitCode:', exitCode)
    //     console.log(`SIGINT_HANDLER: Exiting process with code ${exitCode} (0:success).`)
    //     process.exit(exitCode)
    //     // setTimeout(()=>{process.exit(exitCode)}, 500)
    // }).catch(e => {
    //     console.error('SIGINT_HANDLER: Shutdown not so Gracefully. Error:', e)
    //     process.exit(1)
    // })

}




export const SIGTERM_HANDLER = () => {
    console.log('Gracefully shutting down')
    Promise.allSettled([disconnectCache(), disconnectMessenger()]).then(res => {
        console.log('bye')
        process.exit(0)
    }).catch(e => {
        console.log('Shutdown not so Gracefully', e)
        process.exit(1)
    })
}




export const UNCAUGHT_EXCEPTION_HANDLER = (e: unknown) => {
    console.error('Uncaught exception', e instanceof Error ? e.message : e)
    // TODO - push to error tracking service
}
