import dotenv from "dotenv";
import { Worker } from "bullmq";
import IORedis from "ioredis";

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const documentWorker = new Worker(
  "document-indexing",
  async (job) => {
    console.log(`[worker] processing job ${job.id} — type: ${job.name}`);
    // TODO: implement document indexing processor
  },
  { connection }
);

documentWorker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

documentWorker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log("[worker] document-indexing worker started");
