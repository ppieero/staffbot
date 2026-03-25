import { Router } from "express";
import { body } from "express-validator";
import { authenticate } from "../middleware/auth";
import { requireCompanyAdmin } from "../middleware/requireRole";
import * as ctrl from "../controllers/profile.controller";

const router = Router();

router.use(authenticate, requireCompanyAdmin);

const sharedValidation = [
  body("description").optional().trim(),
  body("systemPrompt").optional().trim(),
  body("language").optional().trim().isLength({ min: 2, max: 10 }),
  body("escalationContact").optional().trim(),
  body("customFields").optional().isArray().withMessage("customFields must be an array"),
  body("customFields.*.id").optional().isString(),
  body("customFields.*.label").optional().isString().notEmpty(),
  body("customFields.*.type").optional().isIn(["text", "number", "select", "date", "boolean"]),
  body("customFields.*.required").optional().isBoolean(),
];

const createValidation = [
  body("name").trim().notEmpty().withMessage("name is required"),
  body("tenantId").optional().isUUID(),
  ...sharedValidation,
];

const updateValidation = [
  body("name").optional().trim().notEmpty(),
  ...sharedValidation,
];

router.get("/", ctrl.listProfiles);
router.post("/", createValidation, ctrl.createProfile);
router.get("/:id", ctrl.getProfile);
router.put("/:id", updateValidation, ctrl.updateProfile);
router.delete("/:id", ctrl.deleteProfile);
router.patch("/:id/status", ctrl.patchProfileStatus);

export default router;
