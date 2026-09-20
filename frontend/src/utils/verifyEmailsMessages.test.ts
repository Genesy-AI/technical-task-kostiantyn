import { describe, it, expect } from 'vitest'
import { getVerifyEmailsToasts } from './verifyEmailsMessages'
import type { LeadsVerifyEmailsOutput } from '../api/types/leads/verifyEmails'

const output = (overrides: Partial<LeadsVerifyEmailsOutput>): LeadsVerifyEmailsOutput => ({
  success: true,
  verifiedCount: 0,
  results: [],
  errors: [],
  ...overrides,
})

describe('getVerifyEmailsToasts', () => {
  it('returns a singular success message for one verified email', () => {
    const toasts = getVerifyEmailsToasts(output({ verifiedCount: 1 }))

    expect(toasts.success).toBe('Verified 1 email')
    expect(toasts.errors).toEqual([])
  })

  it('returns a plural success message for several verified emails', () => {
    expect(getVerifyEmailsToasts(output({ verifiedCount: 3 })).success).toBe('Verified 3 emails')
  })

  it('omits the success message when nothing was verified', () => {
    expect(getVerifyEmailsToasts(output({ verifiedCount: 0 })).success).toBeNull()
  })

  it('returns one error message per failed lead, naming the lead', () => {
    const toasts = getVerifyEmailsToasts(
      output({
        verifiedCount: 2,
        errors: [
          { leadId: 2, leadName: 'Jane Smith', error: 'Email verification timed out' },
          { leadId: 5, leadName: 'Bob Ray', error: 'Unknown error' },
        ],
      })
    )

    expect(toasts.success).toBe('Verified 2 emails')
    expect(toasts.errors).toEqual([
      'Could not verify Jane Smith: Email verification timed out',
      'Could not verify Bob Ray: Unknown error',
    ])
  })
})
