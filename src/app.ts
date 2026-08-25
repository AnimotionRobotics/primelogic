/**
 * Slack Service, for internal business operating enhancement
 * @author Jiang Rui
 * @date 12 May 2026
 * @license None, but strictly constrained to internal use only
 */
import { SIGINT_HANDLER, SIGTERM_HANDLER, UNCAUGHT_EXCEPTION_HANDLER, APP_START_HANDLER, APP_ERROR_HANDLER } from "@apphandlers"

process.once('SIGINT', SIGINT_HANDLER)
process.once('SIGTERM', SIGTERM_HANDLER)
process.once('uncaughtException', UNCAUGHT_EXCEPTION_HANDLER)
process.once('APPERROR', APP_ERROR_HANDLER)
process.once('APPSTART', APP_START_HANDLER)

process.emit('APPSTART')
