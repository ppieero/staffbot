import { Worker, Job } from "bullmq";
import axios from "axios";

interface NotionSyncJob {
  notionResourceId: string;
  tenantId: string;
}

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

const cfg = () => ({
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:4000",
  workerSecret: process.env.WORKER_SECRET ?? "",
});

async function processSyncJob(job: Job<NotionSyncJob>) {
  const { notionResourceId, tenantId } = job.data;
  const { backendUrl, workerSecret } = cfg();

  console.log(`[notion-worker] syncing resource ${notionResourceId} (attempt ${job.attemptsMade + 1})`);

  await axios.post(
    `${backendUrl}/api/integrations/notion/resources/${notionResourceId}/sync-internal`,
    { tenantId },
    { headers: { "x-worker-key": workerSecret }, timeout: 120_000 }
  );

  console.log(`[notion-worker] resource ${notionResourceId} synced`);
}

export function startNotionWorker() {
  const worker = new Worker<NotionSyncJob>("notion-sync", processSyncJob, {
    connection,
    concurrency: 3,
  });

  worker.on("completed", (job) =>
    console.log(`[notion-worker] job ${job.id} completed`)
  );

  worker.on("failed", (job, err) =>
    console.error(`[notion-worker] job ${job?.id} failed:`, err.message)
  );

  console.log("[notion-worker] listening on queue notion-sync");
  return worker;
}
