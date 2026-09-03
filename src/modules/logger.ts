type LogLevel = 'info' | 'warn' | 'error'

type LogValue = string | number | boolean | null | undefined

type LogDetails = Record<string, LogValue>

// Write one structured application log
export const logEvent = (level: LogLevel, event: string, details: LogDetails = {}): void => {

    const datetime = new Date().toISOString()
    const detailsJson = JSON.stringify(details, null, 4).replace(/\n\s*/g, ' ')
    const logLine = `[${level.toUpperCase()}]  [${datetime}]  [${event}]:  ${detailsJson}`

    if (level === 'info') {
        console.info(logLine)
    }

    if (level === 'warn') {
        console.warn(logLine)
    }

    if (level === 'error') {
        console.error(logLine)
    }
}
