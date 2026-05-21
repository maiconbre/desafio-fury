import { Queue } from 'bullmq'
import { connection } from './connection.js'

export const takedownQueue = new Queue('takedown', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    // Keep completed jobs for 1h (max 500) so GET /jobs/:id works after processing
    removeOnComplete: { count: 500, age: 3600 },
    // Keep failed jobs for 24h (max 200) for debugging and observability
    removeOnFail: { count: 200, age: 86400 },
  },
})
