import { Worker, Job } from "bullmq";
import axios from "axios";

interface DocumentIndexJob {
  documentId: string;
  tenantId: string;
  profileId: string;
  fileUrl: string;
  fileType: string;
}

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

// Read from process.env at call-time (not module-load-time) so dotenv is in effect
const cfg = () => ({
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:4000",
  ragUrl: process.env.RAG_ENGINE_URL ?? "http://localhost:8000",
  workerSecret: process.env.WORKER_SECRET ?? "",
});

async function updateDocumentStatus(
  documentId: string,
  status: "pending" | "processing" | "indexed" | "error",
  chunkCount?: number,
  errorMessage?: string
) {
  const { backendUrl, workerSecret } = cfg();
  await axios.patch(
    `${backendUrl}/api/documents/${documentId}/status`,
    { status, chunkCount, errorMessage },
    { headers: { "x-worker-key": workerSecret } }
  );
}

async function processIndexJob(job: Job<DocumentIndexJob>) {
  const { documentId, tenantId, profileId, fileUrl, fileType } = job.data;
  const { ragUrl } = cfg();

  console.log(`[worker] processing document ${documentId} (attempt ${job.attemptsMade + 1})`);

  // Mark as processing
  await updateDocumentStatus(documentId, "processing");

  // Call RAG engine
  const response = await axios.post(`${ragUrl}/index`, {
    document_id: documentId,
    tenant_id: tenantId,
    profile_id: profileId,
    file_url: fileUrl,
    file_type: fileType,
  });

  const { chunk_count } = response.data;

  // Mark as indexed
  await updateDocumentStatus(documentId, "indexed", chunk_count);

  console.log(`[worker] document ${documentId} indexed — ${chunk_count} chunks`);
}

export function startDocumentWorker() {
  const worker = new Worker<DocumentIndexJob>(
    "document-index",
    async (job) => {
      try {
        await processIndexJob(job);
      } catch (err: any) {
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (isLastAttempt) {
          const errorMessage =
            err?.response?.data?.detail ?? err?.message ?? "Unknown error";
          console.error(`[worker] document ${job.data.documentId} failed permanently:`, errorMessage);
          await updateDocumentStatus(
            job.data.documentId,
            "error",
            undefined,
            errorMessage
          ).catch(() => {}); // Don't re-throw status update failures
        } else {
          console.warn(
            `[worker] document ${job.data.documentId} failed (attempt ${job.attemptsMade + 1}), will retry`
          );
        }
        throw err; // Re-throw so BullMQ applies backoff/retry
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log("[worker] document-index worker started");
  return worker;
}
