import { ApplicationFailure, TimeoutFailure } from '@temporalio/client'

export type VerifiableLead = {
  id: number
  firstName: string
  lastName: string
  email: string
}

export type VerifyEmailsOutcome = {
  verifiedCount: number
  results: Array<{ leadId: number; emailVerified: boolean }>
  errors: Array<{ leadId: number; leadName: string; error: string }>
}

// Temporal wraps the real failure: WorkflowFailedError -> ActivityFailure -> TimeoutFailure/ApplicationFailure.
export function describeVerifyError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error'

  for (let cause: unknown = error; cause instanceof Error; cause = (cause as { cause?: unknown }).cause) {
    if (cause instanceof TimeoutFailure) return 'Email verification timed out'
    if (cause instanceof ApplicationFailure) return cause.message
  }

  return error.message
}

export async function verifyLeadEmails(
  leads: VerifiableLead[],
  verify: (lead: VerifiableLead) => Promise<boolean>
): Promise<VerifyEmailsOutcome> {
  const settled = await Promise.allSettled(leads.map((lead) => verify(lead)))

  const outcome: VerifyEmailsOutcome = { verifiedCount: 0, results: [], errors: [] }

  settled.forEach((result, index) => {
    const lead = leads[index]

    if (result.status === 'fulfilled') {
      outcome.results.push({ leadId: lead.id, emailVerified: result.value })
      outcome.verifiedCount += 1
    } else {
      outcome.errors.push({
        leadId: lead.id,
        leadName: `${lead.firstName} ${lead.lastName}`.trim(),
        error: describeVerifyError(result.reason),
      })
    }
  })

  return outcome
}
