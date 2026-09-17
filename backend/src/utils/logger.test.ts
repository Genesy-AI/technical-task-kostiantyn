import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger, serializeError } from './logger'

describe('logger', () => {
  let stdout: any
  let stderr: any

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true as never)
    stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a single JSON event carrying the event name and the fields', () => {
    logger.info('http_request', { requestId: 'abc', statusCode: 200 })

    expect(stdout).toHaveBeenCalledTimes(1)
    const record = JSON.parse((stdout.mock.calls[0][0] as string).trim())
    expect(record).toMatchObject({ level: 'info', msg: 'http_request', statusCode: 200, requestId: 'abc' })
    expect(record.service).toBe('tinyenginy-backend')
    expect(typeof record.time).toBe('string')
    expect(stderr).not.toHaveBeenCalled()
  })

  it('routes error-level events to stderr', () => {
    logger.error('http_request_failed', { statusCode: 500 })

    expect(stderr).toHaveBeenCalledTimes(1)
    expect(stdout).not.toHaveBeenCalled()
  })

  it('serializes thrown errors with name, message and stack', () => {
    const fields = serializeError(new Error('boom'))

    expect(fields).toMatchObject({ errorName: 'Error', errorMessage: 'boom' })
    expect(typeof fields.errorStack).toBe('string')
  })

  it('serializes non-Error throws without dropping them', () => {
    expect(serializeError('oops')).toMatchObject({ errorName: 'UnknownError', errorMessage: 'oops' })
  })
})
