import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { logger, serializeError, type LogFields } from '../utils/logger'

interface RequestOutcome {
  level: 'info' | 'error'
  msg: string
  fields?: LogFields
}

/**
 * Emits exactly one structured event per request at completion, correlated by
 * `x-request-id`. Handlers add business context through setRequestOutcome and
 * recordRequestError; they do not log on their own.
 */
export function requestObservability(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id')?.trim()
  const requestId = incomingId && incomingId.length > 0 ? incomingId : randomUUID()
  res.setHeader('x-request-id', requestId)

  const startedAt = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const outcome: RequestOutcome =
      (res.locals.outcome as RequestOutcome | undefined) ??
      (res.statusCode >= 500
        ? { level: 'error', msg: 'http_request_failed' }
        : { level: 'info', msg: 'http_request' })

    const fields: LogFields = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      ...(res.locals.errorFields as LogFields | undefined),
      ...outcome.fields,
    }
    logger[outcome.level](outcome.msg, fields)
  })

  next()
}

/** Records the error context a request event should carry when it fails. */
export function recordRequestError(res: Response, error: unknown): void {
  res.locals.errorFields = serializeError(error)
}

/** Overrides the request event's event name, level, and business context. */
export function setRequestOutcome(res: Response, outcome: RequestOutcome): void {
  res.locals.outcome = outcome
}

/** Terminal error handler: attaches the thrown error to the request event. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  recordRequestError(res, error)
  if (res.headersSent) {
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}
