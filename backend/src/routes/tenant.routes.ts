import { Router } from "express";
import { body } from "express-validator";
import { authenticate } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/requireRole";
import * as ctrl from "../controllers/tenant.controller";

const router = Router();

// All tenant routes are super-admin only
router.use(authenticate, requireSuperAdmin);

const createValidation = [
  body("name").trim().notEmpty().withMessage("name is required"),
  body("slug")
    .trim()
    .notEmpty()
    .matches(/^[a-z0-9-]+$/)
    .withMessage("slug must be lowercase alphanumeric with hyphens"),
  body("adminEmail").isEmail().normalizeEmail().withMessage("valid adminEmail required"),
  body("adminPassword")
    .isLength({ min: 8 })
    .withMessage("adminPassword must be at least 8 characters"),
  body("adminFirstName").trim().notEmpty().withMessage("adminFirstName is required"),
  body("adminLastName").trim().notEmpty().withMessage("adminLastName is required"),
  body("plan")
    .optional()
    .isIn(["starter", "professional", "enterprise"])
    .withMessage("plan must be starter | professional | enterprise"),
  body("maxEmployees").optional().isInt({ min: 1 }),
  body("maxDocuments").optional().isInt({ min: 1 }),
  body("maxMessagesPerMonth").optional().isInt({ min: 1 }),
];

const updateValidation = [
  body("plan")
    .optional()
    .isIn(["starter", "professional", "enterprise"]),
  body("status")
    .optional()
    .isIn(["active", "suspended", "trial"]),
  body("maxEmployees").optional().isInt({ min: 1 }),
  body("maxDocuments").optional().isInt({ min: 1 }),
  body("maxMessagesPerMonth").optional().isInt({ min: 1 }),
];

router.get("/", ctrl.listTenants);
router.post("/", createValidation, ctrl.createTenant);
router.get("/:id", ctrl.getTenant);
router.put("/:id", updateValidation, ctrl.updateTenant);
router.delete("/:id", ctrl.deleteTenant);
router.get("/:id/stats", ctrl.getTenantStats);

export default router;
