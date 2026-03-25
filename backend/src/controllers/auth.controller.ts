import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users, tenants } from "../db/schema";
import {
  comparePassword,
  generateTokens,
  verifyRefreshToken,
} from "../services/auth.service";
import { redis } from "../lib/redis";

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body as { email: string; password: string };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  const { accessToken, refreshToken } = generateTokens(
    user.id,
    user.role,
    user.tenantId
  );

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    },
  });
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(422).json({ error: "refreshToken is required" });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    // Reject if on blocklist
    const blocked = await redis.get(`blocklist:${refreshToken}`);
    if (blocked) {
      res.status(401).json({ error: "Token has been revoked" });
      return;
    }

    const { accessToken } = generateTokens(
      payload.sub,
      payload.role,
      payload.tenantId
    );

    res.json({ accessToken });
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      res.status(403).json({ error: "Refresh token expired, please log in again" });
      return;
    }
    res.status(401).json({ error: "Invalid refresh token" });
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };
  const authHeader = req.headers.authorization;

  // Blocklist the access token for the remaining TTL
  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.slice(7);
    try {
      const decoded = jwt.decode(accessToken) as { exp?: number } | null;
      const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
      if (ttl > 0) {
        await redis.setex(`blocklist:${accessToken}`, ttl, "1");
      }
    } catch {
      // ignore decode errors
    }
  }

  // Blocklist the refresh token for 30 days
  if (refreshToken) {
    await redis.setex(`blocklist:${refreshToken}`, 60 * 60 * 24 * 30, "1");
  }

  res.json({ message: "Logged out successfully" });
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      tenantId: users.tenantId,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user });
}

// ─── POST /api/auth/impersonate/:tenantId ─────────────────────────────────────

export async function impersonate(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can impersonate" });
    return;
  }

  const { tenantId } = req.params;

  const [tenantAdmin] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "company_admin"), eq(users.isActive, true)))
    .limit(1);

  if (!tenantAdmin) {
    res.status(404).json({ error: "No active admin user found for this tenant" });
    return;
  }

  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const { accessToken } = generateTokens(tenantAdmin.id, tenantAdmin.role, tenantAdmin.tenantId);

  res.json({
    accessToken,
    impersonating: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      adminEmail: tenantAdmin.email,
    },
  });
}
