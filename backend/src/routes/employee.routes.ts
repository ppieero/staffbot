import { Router, Request, Response } from "express";
import { body } from "express-validator";
import { eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireCompanyAdmin } from "../middleware/requireRole";
import * as ctrl from "../controllers/employee.controller";
import { sendVerificationMessage, verifyCode } from "../services/whatsapp-verification.service";
import { sendWelcomeMessage } from "../services/welcome.service";
import { generateTelegramLinkCode } from "../services/telegram-link.service";
import { db } from "../db";
import { employees } from "../db/schema";

const router = Router();

router.use(authenticate, requireCompanyAdmin);

const createValidation = [
  body("profileId").isUUID().withMessage("valid profileId (uuid) is required"),
  body("firstName").trim().notEmpty().withMessage("firstName is required"),
  body("lastName").trim().notEmpty().withMessage("lastName is required"),
  body("phoneWhatsapp").optional().trim(),
  body("telegramUserId").optional().trim(),
  body("email").optional().isEmail().normalizeEmail(),
  body("department").optional().trim(),
  body("languagePref").optional().trim().isLength({ min: 2, max: 10 }),
];

const updateValidation = [
  body("profileId").optional().isUUID(),
  body("firstName").optional().trim().notEmpty(),
  body("lastName").optional().trim().notEmpty(),
  body("email").optional().isEmail().normalizeEmail(),
  body("department").optional().trim(),
  body("languagePref").optional().trim().isLength({ min: 2, max: 10 }),
];

router.get("/", ctrl.listEmployees);
router.post("/bulk", ctrl.bulkCreateEmployees);   // before /:id to avoid conflict
router.post("/", createValidation, ctrl.createEmployee);
router.get("/:id", ctrl.getEmployee);
router.put("/:id", updateValidation, ctrl.updateEmployee);
router.patch("/:id/status", ctrl.patchEmployeeStatus);

// POST /api/employees/:id/verify — submit a verification code
router.post("/:id/verify", async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const ok = await verifyCode(req.params.id, code);
  if (!ok) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }
  res.json({ verified: true });
});

// POST /api/employees/:id/resend-verification — resend WhatsApp verification code
router.post("/:id/resend-verification", async (req: Request, res: Response) => {
  const result = await sendVerificationMessage(req.params.id);
  if (!result.sent) {
    res.status(400).json({ error: result.reason ?? "Could not send verification" });
    return;
  }
  res.json({ sent: true });
});

// POST /api/employees/:id/telegram-link — generate a new Telegram link code
router.post("/:id/telegram-link", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const [employee] = await db
      .select({ id: employees.id, tenantId: employees.tenantId, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, req.params.id))
      .limit(1);

    if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
    if (user.role !== "super_admin" && employee.tenantId !== user.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const code = await generateTelegramLinkCode(employee.id);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    res.json({
      code,
      expires: expires.toISOString(),
      instructions: `Tell ${employee.firstName} ${employee.lastName} to open Telegram, search for @StaffBotApp_bot, and send: ${code}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:id/welcome — send welcome message via preferred channel
router.post("/:id/welcome", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const [employee] = await db
      .select({ id: employees.id, tenantId: employees.tenantId })
      .from(employees)
      .where(eq(employees.id, req.params.id))
      .limit(1);

    if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
    if (user.role !== "super_admin" && employee.tenantId !== user.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const result = await sendWelcomeMessage(employee.id);
    if (!result.sent) {
      res.status(400).json({ error: result.reason ?? "Could not send welcome message" });
      return;
    }
    res.json({ sent: true, channel: result.channel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
