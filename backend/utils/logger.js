/**
 * Structured JSON logger for production tracing.
 * Supports log levels: debug, info, warn, error.
 * Set LOG_LEVEL env variable to control verbosity (default: info).
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function formatLog(level, component, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...meta,
  });
}

export function createLogger(component) {
  return {
    debug(msg, meta) {
      if (CURRENT_LEVEL <= LOG_LEVELS.debug) console.debug(formatLog('debug', component, msg, meta));
    },
    info(msg, meta) {
      if (CURRENT_LEVEL <= LOG_LEVELS.info) console.log(formatLog('info', component, msg, meta));
    },
    warn(msg, meta) {
      if (CURRENT_LEVEL <= LOG_LEVELS.warn) console.warn(formatLog('warn', component, msg, meta));
    },
    error(msg, meta) {
      if (CURRENT_LEVEL <= LOG_LEVELS.error) console.error(formatLog('error', component, msg, meta));
    },
  };
}
