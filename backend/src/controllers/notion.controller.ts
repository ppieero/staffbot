import { Request, Response } from "express";
import crypto from "crypto";
import { redis } from "../lib/redis";
import { getNotionOAuthUrl } from "../lib/notion";
import * as svc from "../services/notion.service";

function resolveTenantId(req: Request): string {
  const user = req.user!;
  if (user.role !== "super_admin") return user.tenantId!;
  const override = req.query.tenantId ?? req.body?.tenantId;
  if (!override) throw new Error("tenantId required for super_admin");
  return override as string;
}

// GET /api/integrations/notion
export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const conn = await svc.getConnection(tenantId);
    if (!conn) {
      res.json({ connected: false });
      return;
    }
    res.json({
      connected: true,
      workspaceName: conn.workspaceName,
      workspaceIcon: conn.workspaceIcon,
      workspaceId: conn.workspaceId,
      connectedAt: conn.createdAt,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// GET /api/integrations/notion/auth
export async function startOAuth(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const state = crypto.randomBytes(16).toString("hex");
    // Store state → tenantId mapping for 10 minutes
    await redis.set(`notion_oauth:${state}`, tenantId, "EX", 600);
    const url = getNotionOAuthUrl(state);
    res.json({ url });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// GET /api/integrations/notion/callback
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/integraciones/notion?error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state" });
    return;
  }

  try {
    const tenantId = await redis.get(`notion_oauth:${state}`);
    if (!tenantId) {
      res.status(400).json({ error: "Invalid or expired OAuth state" });
      return;
    }

    await redis.del(`notion_oauth:${state}`);
    await svc.connectNotion(tenantId, code);

    res.redirect(`${process.env.FRONTEND_URL}/dashboard/integraciones/notion?connected=true`);
  } catch (err: unknown) {
    console.error("[notion oauth]", err);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/integraciones/notion?error=oauth_failed`);
  }
}

// DELETE /api/integrations/notion
export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    await svc.disconnectNotion(tenantId);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// GET /api/integrations/notion/resources/browse
export async function browseWorkspace(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const objects = await svc.browseWorkspace(tenantId);
    res.json({ objects });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("No active Notion connection")) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

// GET /api/integrations/notion/resources
export async function listResources(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const resources = await svc.listResources(tenantId);
    res.json({ resources });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// POST /api/integrations/notion/resources
export async function addResource(req: Request, res: Response): Promise<void> {
  const { notionObjectId, title, objectType, resourceCategory, profileIds } = req.body as {
    notionObjectId?: string;
    title?: string;
    objectType?: string;
    resourceCategory?: string;
    profileIds?: string[];
  };

  if (!notionObjectId || !title || !objectType) {
    res.status(422).json({ error: "notionObjectId, title, and objectType are required" });
    return;
  }
  if (!["database", "page"].includes(objectType)) {
    res.status(422).json({ error: "objectType must be 'database' or 'page'" });
    return;
  }
  if (resourceCategory && !["agenda", "document", "custom"].includes(resourceCategory)) {
    res.status(422).json({ error: "resourceCategory must be 'agenda', 'document', or 'custom'" });
    return;
  }

  try {
    const tenantId = resolveTenantId(req);
    const resource = await svc.addResource(tenantId, {
      notionObjectId,
      title,
      objectType: objectType as "database" | "page",
      resourceCategory: (resourceCategory ?? "document") as "agenda" | "document" | "custom",
      profileIds: profileIds ?? [],
    });
    res.status(201).json({ resource });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("No active Notion connection") ? 409 : 500;
    res.status(status).json({ error: msg });
  }
}

// DELETE /api/integrations/notion/resources/:id
export async function deleteResource(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    await svc.deleteResource(tenantId, req.params.id);
    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
  }
}

// POST /api/integrations/notion/resources/:id/sync
export async function syncResource(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    await svc.triggerSync(tenantId, req.params.id);
    res.json({ ok: true, message: "Sync enqueued" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
  }
}

// PATCH /api/integrations/notion/resources/:id/index-images
export async function patchIndexImages(req: Request, res: Response): Promise<void> {
  const { indexImages } = req.body as { indexImages?: unknown };
  if (typeof indexImages !== "boolean") {
    res.status(400).json({ error: "indexImages must be boolean" });
    return;
  }
  try {
    const tenantId = resolveTenantId(req);
    const result = await svc.patchIndexImages(tenantId, req.params.id, indexImages);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
  }
}

// GET /api/integrations/notion/resources/by-profile/:profileId
export async function getResourcesByProfile(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const resources = await svc.getResourcesByProfile(tenantId, req.params.profileId);
    res.json({ resources });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// PUT /api/integrations/notion/resources/:id/profiles
export async function updateResourceProfiles(req: Request, res: Response): Promise<void> {
  const { profileIds } = req.body as { profileIds?: string[] };
  if (!Array.isArray(profileIds)) {
    res.status(422).json({ error: "profileIds must be an array" });
    return;
  }

  try {
    const tenantId = resolveTenantId(req);
    const result = await svc.updateResourceProfiles(tenantId, req.params.id, profileIds);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("not found") ? 404 : msg.includes("does not belong") ? 422 : 500;
    res.status(status).json({ error: msg });
  }
}
