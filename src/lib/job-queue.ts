/**
 * Simple in-memory job queue for async operations.
 * For a small app this is sufficient - no Redis/Bull needed.
 * Jobs are fire-and-forget with status polling.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job<T = unknown> {
  id: string;
  status: JobStatus;
  result?: T;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const jobs = new Map<string, Job>();

// Cleanup old jobs every 10 minutes (keep for 30 min after completion)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.completedAt && job.completedAt < cutoff) {
      jobs.delete(id);
    }
    // Also cleanup stale pending/running jobs (>10 min)
    if (!job.completedAt && job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

let counter = 0;

export function createJob<T>(fn: () => Promise<T>): Job<T> {
  const id = `job_${Date.now()}_${++counter}`;
  const job: Job<T> = {
    id,
    status: "pending",
    createdAt: Date.now(),
  };
  jobs.set(id, job as Job);

  // Execute async
  (async () => {
    job.status = "running";
    try {
      job.result = await fn();
      job.status = "completed";
    } catch (e: any) {
      job.error = e.message || "Unknown error";
      job.status = "failed";
    } finally {
      job.completedAt = Date.now();
    }
  })();

  return job;
}

export function getJob<T = unknown>(id: string): Job<T> | undefined {
  return jobs.get(id) as Job<T> | undefined;
}
