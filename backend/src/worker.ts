import { NativeConnection, Worker } from '@temporalio/worker'
import * as activities from './workflows/activities'
import { logger } from './utils/logger'

export async function runTemporalWorker() {
  const address = 'localhost:7233'
  const namespace = 'default'
  const taskQueue = 'myQueue'

  const connection = await NativeConnection.connect({ address })
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities,
    })

    logger.info('temporal_worker_started', { namespace, taskQueue, address })

    await worker.run()

    logger.info('temporal_worker_stopped', { namespace, taskQueue })
  } finally {
    await connection.close()
  }
}
