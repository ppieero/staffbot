import { Router } from "express";
import { body } from "express-validator";
import { login, refresh, logout, me, impersonate } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

// POST /api/auth/login
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 1 }).withMessage("Password is required"),
  ],
  login
);

// POST /api/auth/refresh
router.post("/refresh", refresh);

// POST /api/auth/logout
router.post("/logout", logout);

// GET /api/auth/me
router.get("/me", authenticate, me);

// POST /api/auth/impersonate/:tenantId — super_admin only
router.post("/impersonate/:tenantId", authenticate, impersonate);

export default router;
