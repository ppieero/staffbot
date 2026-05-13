import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { requireCompanyAdmin } from "../middleware/requireRole";
import * as ctrl from "../controllers/notion.controller";
import { syncResourceNow } from "../services/notion.service";

const router = Router();

function requireWorkerKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-worker-key"];
  if (!key || key !== process.env.WORKER_SECRET) {
    res.status(401).json({ error: "Invalid worker key" });
    return;
  }
  next();
}

// Connection status & OAuth
router.get("/", authenticate, requireCompanyAdmin, ctrl.getStatus);
router.get("/auth", authenticate, requireCompanyAdmin, ctrl.startOAuth);
router.get("/callback", ctrl.handleCallback); // No JWT — browser redirect from Notion
router.delete("/", authenticate, requireCompanyAdmin, ctrl.disconnect);

// Resource browsing & management
router.get("/resources/browse", authenticate, requireCompanyAdmin, ctrl.browseWorkspace);
router.get("/resources/by-profile/:profileId", authenticate, requireCompanyAdmin, ctrl.getResourcesByProfile);
router.get("/resources", authenticate, requireCompanyAdmin, ctrl.listResources);
router.post("/resources", authenticate, requireCompanyAdmin, ctrl.addResource);
router.delete("/resources/:id", authenticate, requireCompanyAdmin, ctrl.deleteResource);
router.post("/resources/:id/sync", authenticate, requireCompanyAdmin, ctrl.syncResource);
router.put("/resources/:id/profiles", authenticate, requireCompanyAdmin, ctrl.updateResourceProfiles);
router.patch("/resources/:id/index-images", authenticate, requireCompanyAdmin, ctrl.patchIndexImages);

// Internal — called by the Notion worker
router.post("/resources/:id/sync-internal", requireWorkerKey, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body as { tenantId: string };
    await syncResourceNow(req.params.id, tenantId);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
