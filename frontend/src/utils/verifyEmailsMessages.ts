import type { LeadsVerifyEmailsOutput } from '../api/types/leads/verifyEmails'

export function getVerifyEmailsToasts(data: LeadsVerifyEmailsOutput): {
  success: string | null
  errors: string[]
} {
  return {
    success:
      data.verifiedCount === 0
        ? null
        : `Verified ${data.verifiedCount} ${data.verifiedCount === 1 ? 'email' : 'emails'}`,
    errors: data.errors.map((e) => `Could not verify ${e.leadName}: ${e.error}`),
  }
}
