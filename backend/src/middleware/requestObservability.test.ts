import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { errorHandler, requestObservability, setRequestOutcome } from './requestObservability'

function makeRequest(headers: Record<string, string> = {}, method = 'GET', url = '/leads'): Request {
  return {
    method,
    originalUrl: url,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request
}

function makeResponse(): Response & { _finish: () => void } {
  const listeners: Record<string, () => void> = {}
  const res = {
    statusCode: 200,
    headersSent: false,
    locals: {} as Record<string, unknown>,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()]
    },
    on(event: string, cb: () => void) {
      listeners[event] = cb
      return this
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json() {
      return this
    },
    _finish() {
      listeners.finish?.()
    },
  }
  return res as unknown as Response & { _finish: () => void }
}

const noop = vi.fn() as unknown as NextFunction

describe('requestObservability', () => {
  let stdout: any
  let stderr: any

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true as never)
    stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits exactly one event per successful request, correlated by request id', () => {
    const req = makeRequest({}, 'GET', '/leads')
    const res = makeResponse()

    requestObservability(req, res, noop)
    const requestId = res.getHeader('x-request-id')
    expect(typeof requestId).toBe('string')

    res._finish()

    expect(stdout).toHaveBeenCalledTimes(1)
    const record = JSON.parse((stdout.mock.calls[0][0] as string).trim())
    expect(record).toMatchObject({
      level: 'info',
      msg: 'http_request',
      method: 'GET',
      path: '/leads',
      statusCode: 200,
    })
    expect(record.requestId).toBe(requestId)
    expect(typeof record.durationMs).toBe('number')
  })

  it('reuses an inbound x-request-id so callers stay correlated', () => {
    const req = makeRequest({ 'x-request-id': 'trace-123' }, 'POST', '/leads')
    const res = makeResponse()

    requestObservability(req, res, noop)

    expect(res.getHeader('x-request-id')).toBe('trace-123')
  })

  it('logs a 500 at error level with the thrown error context', () => {
    const req = makeRequest({}, 'POST', '/leads')
    const res = makeResponse()

    requestObservability(req, res, noop)
    errorHandler(new Error('db down'), req, res, noop)
    expect(res.statusCode).toBe(500)
    res._finish()

    expect(stderr).toHaveBeenCalledTimes(1)
    const record = JSON.parse((stderr.mock.calls[0][0] as string).trim())
    expect(record).toMatchObject({
      level: 'error',
      msg: 'http_request_failed',
      statusCode: 500,
      errorName: 'Error',
      errorMessage: 'db down',
    })
  })

  it('names the partial-failure outcome and attaches the failed lead ids', () => {
    const req = makeRequest({}, 'POST', '/leads/generate-messages')
    const res = makeResponse()

    requestObservability(req, res, noop)
    setRequestOutcome(res, {
      level: 'error',
      msg: 'leads_message_generation_partial_failure',
      fields: { operation: 'generateMessages', failedCount: 1, failedLeadIds: [7] },
    })
    res._finish()

    expect(stderr).toHaveBeenCalledTimes(1)
    const record = JSON.parse((stderr.mock.calls[0][0] as string).trim())
    expect(record).toMatchObject({
      level: 'error',
      msg: 'leads_message_generation_partial_failure',
      statusCode: 200,
      failedCount: 1,
      failedLeadIds: [7],
    })
  })
})
