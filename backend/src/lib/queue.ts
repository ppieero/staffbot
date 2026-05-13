import { Queue } from "bullmq";

// BullMQ ships its own ioredis — use a plain connection URL, not an ioredis instance.
const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

// ─── Job Payloads ─────────────────────────────────────────────────────────────

export interface DocumentIndexJob {
  documentId: string;
  tenantId: string;
  profileId: string;
  fileUrl: string;
  fileType: string;
  indexImages?: boolean;
}

export interface DocumentDeleteJob {
  documentId: string;
  tenantId: string;
  vectorIds: string[];
}

// ─── Queues ───────────────────────────────────────────────────────────────────

// "index" and "delete" are the job names used with these queues
export type IndexJobName = "index";
export type DeleteJobName = "delete";

export const documentIndexQueue = new Queue<DocumentIndexJob, void, IndexJobName>(
  "document-index",
  { connection }
);

export const documentDeleteQueue = new Queue<DocumentDeleteJob, void, DeleteJobName>(
  "document-delete",
  { connection }
);

// ─── Notion Sync ──────────────────────────────────────────────────────────────

export interface NotionSyncJob {
  notionResourceId: string;
  tenantId: string;
}

export type NotionSyncJobName = "sync-resource";

export const notionSyncQueue = new Queue<NotionSyncJob, void, NotionSyncJobName>(
  "notion-sync",
  { connection }
);
