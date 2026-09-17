export type LogFields = Record<string, unknown>

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'tinyenginy-backend'

/**
 * Structured, single-line JSON logger. Messages are constant event names; all
 * dynamic values travel as fields so events stay groupable by template.
 */
function write(level: 'info' | 'error', msg: string, fields?: LogFields): void {
  const record = {
    level,
    msg,
    time: new Date().toISOString(),
    service: SERVICE_NAME,
    ...fields,
  }
  const line = `${JSON.stringify(record)}\n`
  if (level === 'error') {
    process.stderr.write(line)
  } else {
    process.stdout.write(line)
  }
}

export const logger = {
  info: (msg: string, fields?: LogFields): void => write('info', msg, fields),
  error: (msg: string, fields?: LogFields): void => write('error', msg, fields),
}

/** Flattens an unknown thrown value into log-safe fields. */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    }
  }
  return { errorName: 'UnknownError', errorMessage: String(error) }
}
