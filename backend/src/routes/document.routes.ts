import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth";
import { requireCompanyAdmin } from "../middleware/requireRole";
import * as ctrl from "../controllers/document.controller";

const router = Router();

// ─── Multer (memory storage, 50 MB limit) ────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: pdf, docx, txt, xlsx`));
    }
  },
});

// Wraps multer so errors become 422 responses instead of unhandled exceptions
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(422).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err) {
      res.status(422).json({ error: (err as Error).message });
      return;
    }
    next();
  });
}

// ─── Internal worker middleware ───────────────────────────────────────────────

function requireWorkerKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-worker-key"];
  if (!key || key !== process.env.WORKER_SECRET) {
    res.status(401).json({ error: "Invalid worker key" });
    return;
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/", authenticate, requireCompanyAdmin, ctrl.listDocuments);
router.post("/reindex-all", authenticate, ctrl.reindexAllDocuments);
router.post("/upload", authenticate, requireCompanyAdmin, handleUpload, ctrl.uploadDocument);
router.get("/:id", authenticate, requireCompanyAdmin, ctrl.getDocument);
router.get("/:id/download", authenticate, requireCompanyAdmin, ctrl.downloadDocument);
router.delete("/:id", authenticate, requireCompanyAdmin, ctrl.deleteDocument);
router.post("/:id/reindex", authenticate, requireCompanyAdmin, ctrl.reindexDocument);

router.patch("/:id/profile-assignment", authenticate, requireCompanyAdmin, ctrl.patchProfileAssignment);

// Internal route for worker status updates — no JWT, uses worker key instead
router.patch("/:id/status", requireWorkerKey, ctrl.patchDocumentStatus);

export default router;
