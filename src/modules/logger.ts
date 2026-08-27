type LogLevel = 'info' | 'warn' | 'error'

type LogValue = string | number | boolean | null | undefined

type LogDetails = Record<string, LogValue>

// Write one structured application log
export const logEvent = (level: LogLevel, event: string, details: LogDetails = {}): void => {

    const logLine = JSON.stringify({ timestamp: new Date().toISOString(), level, event, details }, null, 4).replace(/\n\s*/g, ' ')

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
