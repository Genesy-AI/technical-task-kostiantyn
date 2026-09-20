import { describe, it, expect } from 'vitest'
import {
  ActivityFailure,
  ApplicationFailure,
  TimeoutFailure,
  WorkflowFailedError,
} from '@temporalio/client'
import { describeVerifyError, verifyLeadEmails } from './verifyEmails'

// TimeoutType.START_TO_CLOSE (1); the enum isn't re-exported by the packages we depend on
const START_TO_CLOSE = 1 as unknown as ConstructorParameters<typeof TimeoutFailure>[2]

const lead = (id: number, firstName: string, email: string) => ({
  id,
  firstName,
  lastName: 'Test',
  email,
})

const activityTimeout = () =>
  new WorkflowFailedError(
    'Workflow execution failed',
    new ActivityFailure(
      'Activity task failed',
      'verifyEmail',
      '1',
      undefined,
      'worker',
      new TimeoutFailure('Activity timed out', undefined, START_TO_CLOSE)
    ),
    undefined
  )

describe('describeVerifyError', () => {
  it('reports an activity timeout after retries as a timeout', () => {
    expect(describeVerifyError(activityTimeout())).toBe(
      'Email verification timed out'
    )
  })

  it('reports a workflow-level timeout as a timeout', () => {
    const error = new WorkflowFailedError(
      'Workflow execution timed out',
      new TimeoutFailure('Workflow timed out', undefined, START_TO_CLOSE),
      undefined
    )

    expect(describeVerifyError(error)).toBe('Email verification timed out')
  })

  it('surfaces the message of an application failure in the cause chain', () => {
    const error = new WorkflowFailedError(
      'Workflow execution failed',
      ApplicationFailure.nonRetryable('SMTP server rejected the address'),
      undefined
    )

    expect(describeVerifyError(error)).toBe('SMTP server rejected the address')
  })

  it('uses the message of a plain Error', () => {
    expect(describeVerifyError(new Error('connect ECONNREFUSED 127.0.0.1:7233'))).toBe(
      'connect ECONNREFUSED 127.0.0.1:7233'
    )
  })

  it('falls back to a generic message for non-Error values', () => {
    expect(describeVerifyError('boom')).toBe('Unknown error')
  })
})

describe('verifyLeadEmails', () => {
  it('returns a result for every lead that verifies', async () => {
    const leads = [lead(1, 'Ann', 'ann@example.com'), lead(2, 'Bob', 'bob+x@example.com')]

    const outcome = await verifyLeadEmails(leads, async (l) => !l.email.includes('+'))

    expect(outcome.verifiedCount).toBe(2)
    expect(outcome.results).toEqual([
      { leadId: 1, emailVerified: true },
      { leadId: 2, emailVerified: false },
    ])
    expect(outcome.errors).toEqual([])
  })

  it('lists a failing lead in errors and still verifies the others', async () => {
    const leads = [
      lead(1, 'Ann', 'ann@example.com'),
      lead(2, 'Jane', 'jane.smith@example.com'),
      lead(3, 'Cid', 'cid@example.com'),
    ]

    const outcome = await verifyLeadEmails(leads, async (l) => {
      if (l.email.includes('jane.smith')) throw activityTimeout()
      return true
    })

    expect(outcome.verifiedCount).toBe(2)
    expect(outcome.results.map((r) => r.leadId)).toEqual([1, 3])
    expect(outcome.errors).toEqual([
      {
        leadId: 2,
        leadName: 'Jane Test',
        error: 'Email verification timed out',
      },
    ])
  })

  it('runs verifications in parallel, not one after another', async () => {
    const leads = [1, 2, 3, 4].map((id) => lead(id, 'L', `l${id}@example.com`))
    let inFlight = 0
    let maxInFlight = 0

    await verifyLeadEmails(leads, async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight -= 1
      return true
    })

    expect(maxInFlight).toBe(4)
  })
})
