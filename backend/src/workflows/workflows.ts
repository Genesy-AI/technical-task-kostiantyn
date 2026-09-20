import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

// Worst case for a stuck lead: 3 attempts x 3s + 0.5s + 1s backoff = 10.5s, then the workflow fails.
const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '500 milliseconds',
    backoffCoefficient: 2,
  },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}
