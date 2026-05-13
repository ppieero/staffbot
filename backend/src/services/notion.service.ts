import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  notionConnections,
  notionResources,
  notionResourceProfiles,
  positionProfiles,
} from "../db/schema";
import {
  encryptToken,
  decryptToken,
  exchangeNotionCode,
  listNotionObjects,
  extractNotionPageText,
  extractNotionDatabaseText,
} from "../lib/notion";

// ─── Connection ───────────────────────────────────────────────────────────────

export async function getConnection(tenantId: string) {
  const [conn] = await db
    .select()
    .from(notionConnections)
    .where(and(eq(notionConnections.tenantId, tenantId), eq(notionConnections.status, "active")));
  return conn ?? null;
}

export async function connectNotion(tenantId: string, code: string) {
  const tokenData = await exchangeNotionCode(code);
  const encryptedToken = encryptToken(tokenData.access_token);

  // Upsert — one connection per tenant
  const existing = await getConnection(tenantId);
  if (existing) {
    const [updated] = await db
      .update(notionConnections)
      .set({
        accessToken: encryptedToken,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        botId: tokenData.bot_id,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(notionConnections.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(notionConnections)
    .values({
      tenantId,
      accessToken: encryptedToken,
      workspaceId: tokenData.workspace_id,
      workspaceName: tokenData.workspace_name,
      workspaceIcon: tokenData.workspace_icon,
      botId: tokenData.bot_id,
      status: "active",
    })
    .returning();
  return created;
}

export async function disconnectNotion(tenantId: string) {
  await db
    .update(notionConnections)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(notionConnections.tenantId, tenantId));
}

// ─── Browse workspace ─────────────────────────────────────────────────────────

export async function browseWorkspace(tenantId: string) {
  const conn = await getConnection(tenantId);
  if (!conn) throw new Error("No active Notion connection");
  const token = decryptToken(conn.accessToken);
  return listNotionObjects(token);
}

// ─── Resources ────────────────────────────────────────────────────────────────

export async function listResources(tenantId: string) {
  const resources = await db
    .select()
    .from(notionResources)
    .where(eq(notionResources.tenantId, tenantId));

  const withProfiles = await Promise.all(
    resources.map(async (r) => {
      const assignments = await db
        .select({ profileId: notionResourceProfiles.profileId })
        .from(notionResourceProfiles)
        .where(eq(notionResourceProfiles.notionResourceId, r.id));
      return { ...r, profileIds: assignments.map((a) => a.profileId) };
    })
  );

  return withProfiles;
}

export async function addResource(
  tenantId: string,
  data: {
    notionObjectId: string;
    title: string;
    objectType: "database" | "page";
    resourceCategory: "agenda" | "document" | "custom";
    profileIds: string[];
  }
) {
  const conn = await getConnection(tenantId);
  if (!conn) throw new Error("No active Notion connection");

  // Validate all profileIds belong to this tenant
  if (data.profileIds.length > 0) {
    const profiles = await db
      .select({ id: positionProfiles.id })
      .from(positionProfiles)
      .where(eq(positionProfiles.tenantId, tenantId));
    const validIds = new Set(profiles.map((p) => p.id));
    for (const pid of data.profileIds) {
      if (!validIds.has(pid)) throw new Error(`Profile ${pid} does not belong to this tenant`);
    }
  }

  const [resource] = await db
    .insert(notionResources)
    .values({
      tenantId,
      connectionId: conn.id,
      notionObjectId: data.notionObjectId,
      title: data.title,
      objectType: data.objectType,
      resourceCategory: data.resourceCategory,
      syncStatus: "pending",
    })
    .returning();

  if (data.profileIds.length > 0) {
    await db.insert(notionResourceProfiles).values(
      data.profileIds.map((pid) => ({ notionResourceId: resource.id, profileId: pid }))
    );
  }

  return { ...resource, profileIds: data.profileIds };
}

export async function deleteResource(tenantId: string, resourceId: string) {
  const [resource] = await db
    .select()
    .from(notionResources)
    .where(and(eq(notionResources.id, resourceId), eq(notionResources.tenantId, tenantId)));
  if (!resource) throw new Error("Resource not found");

  // Remove vectors from Qdrant before deleting the DB record
  const { RAG_ENGINE_URL } = process.env;
  if (RAG_ENGINE_URL) {
    await fetch(`${RAG_ENGINE_URL}/index/delete-notion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notion_resource_id: resourceId, tenant_id: tenantId }),
    }).catch((err) => console.error("[notion] failed to delete qdrant vectors:", err));
  }

  await db.delete(notionResources).where(eq(notionResources.id, resourceId));
  return resource;
}

export async function updateResourceProfiles(
  tenantId: string,
  resourceId: string,
  profileIds: string[]
) {
  const [resource] = await db
    .select()
    .from(notionResources)
    .where(and(eq(notionResources.id, resourceId), eq(notionResources.tenantId, tenantId)));
  if (!resource) throw new Error("Resource not found");

  // Validate profileIds belong to tenant
  if (profileIds.length > 0) {
    const profiles = await db
      .select({ id: positionProfiles.id })
      .from(positionProfiles)
      .where(eq(positionProfiles.tenantId, tenantId));
    const validIds = new Set(profiles.map((p) => p.id));
    for (const pid of profileIds) {
      if (!validIds.has(pid)) throw new Error(`Profile ${pid} does not belong to this tenant`);
    }
  }

  await db.delete(notionResourceProfiles).where(eq(notionResourceProfiles.notionResourceId, resourceId));
  if (profileIds.length > 0) {
    await db.insert(notionResourceProfiles).values(
      profileIds.map((pid) => ({ notionResourceId: resourceId, profileId: pid }))
    );
  }

  // Re-sync so Qdrant vectors pick up the updated profile_ids
  if (resource.syncStatus === "synced") {
    await db
      .update(notionResources)
      .set({ syncStatus: "pending", updatedAt: new Date() })
      .where(eq(notionResources.id, resourceId));
    const { notionSyncQueue } = await import("../lib/queue");
    await notionSyncQueue.add("sync-resource", { notionResourceId: resourceId, tenantId });
  }

  return { resourceId, profileIds };
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function patchIndexImages(
  tenantId: string,
  resourceId: string,
  indexImages: boolean,
): Promise<{ resourceId: string; indexImages: boolean }> {
  const [resource] = await db
    .select()
    .from(notionResources)
    .where(and(eq(notionResources.id, resourceId), eq(notionResources.tenantId, tenantId)));
  if (!resource) throw new Error("Resource not found");

  await db.update(notionResources)
    .set({ indexImages, updatedAt: new Date() })
    .where(eq(notionResources.id, resourceId));

  // Re-sync if already synced so Qdrant payload reflects the new setting
  if (resource.syncStatus === "synced") {
    const { notionSyncQueue } = await import("../lib/queue");
    await notionSyncQueue.add("sync-resource", { notionResourceId: resourceId, tenantId });
  }

  return { resourceId, indexImages };
}

export async function getResourcesByProfile(tenantId: string, profileId: string) {
  const assignments = await db
    .select({ notionResourceId: notionResourceProfiles.notionResourceId })
    .from(notionResourceProfiles)
    .where(eq(notionResourceProfiles.profileId, profileId));

  if (assignments.length === 0) return [];

  const resourceIds = assignments.map(a => a.notionResourceId);

  return db
    .select()
    .from(notionResources)
    .where(and(
      eq(notionResources.tenantId, tenantId),
      inArray(notionResources.id, resourceIds)
    ));
}

export async function triggerSync(tenantId: string, resourceId: string): Promise<void> {
  const [resource] = await db
    .select()
    .from(notionResources)
    .where(and(eq(notionResources.id, resourceId), eq(notionResources.tenantId, tenantId)));
  if (!resource) throw new Error("Resource not found");

  await db
    .update(notionResources)
    .set({ syncStatus: "pending", updatedAt: new Date() })
    .where(eq(notionResources.id, resourceId));

  // Enqueue via BullMQ
  const { notionSyncQueue } = await import("../lib/queue");
  await notionSyncQueue.add("sync-resource", { notionResourceId: resourceId, tenantId });
}

export async function syncResourceNow(resourceId: string, tenantId: string): Promise<void> {
  const [resource] = await db
    .select()
    .from(notionResources)
    .where(and(eq(notionResources.id, resourceId), eq(notionResources.tenantId, tenantId)));
  if (!resource) throw new Error("Resource not found");

  const conn = await getConnection(tenantId);
  if (!conn) throw new Error("No active Notion connection");

  const token = decryptToken(conn.accessToken);

  await db
    .update(notionResources)
    .set({ syncStatus: "syncing", updatedAt: new Date() })
    .where(eq(notionResources.id, resourceId));

  try {
    let text = "";
    if (resource.objectType === "page") {
      text = await extractNotionPageText(token, resource.notionObjectId);
    } else {
      text = await extractNotionDatabaseText(token, resource.notionObjectId);
    }

    const assignments = await db
      .select({ profileId: notionResourceProfiles.profileId })
      .from(notionResourceProfiles)
      .where(eq(notionResourceProfiles.notionResourceId, resourceId));
    const profileIds = assignments.map((a) => a.profileId);

    const { RAG_ENGINE_URL } = process.env;
    if (!RAG_ENGINE_URL) throw new Error("RAG_ENGINE_URL not set");

    const notionPageUrl = `https://www.notion.so/${resource.notionObjectId.replace(/-/g, "")}`;

    const res = await fetch(`${RAG_ENGINE_URL}/index/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        profile_ids: profileIds,
        source: "notion",
        source_id: resourceId,
        notion_resource_id: resourceId,
        resource_category: resource.resourceCategory,
        title: resource.title,
        text,
        source_type: "notion_page",
        page_url: notionPageUrl,
        page_title: resource.title,
        notion_page_id: resource.notionObjectId,
      }),
    });

    if (!res.ok) throw new Error(`RAG engine error: ${await res.text()}`);
    const data = (await res.json()) as { chunk_count?: number };

    await db
      .update(notionResources)
      .set({
        syncStatus: "synced",
        chunkCount: data.chunk_count ?? 0,
        lastSyncedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(notionResources.id, resourceId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(notionResources)
      .set({ syncStatus: "error", errorMessage: msg, updatedAt: new Date() })
      .where(eq(notionResources.id, resourceId));
    throw err;
  }
}
