import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BCRYPT_ROUNDS = 12;

export interface TokenPayload {
  sub: string;       // userId
  role: string;
  tenantId: string | null;
  type: "access" | "refresh";
}

// ─── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

export function generateTokens(
  userId: string,
  role: string,
  tenantId: string | null
): { accessToken: string; refreshToken: string } {
  const base: Omit<TokenPayload, "type"> = { sub: userId, role, tenantId };

  const accessToken = jwt.sign(
    { ...base, type: "access" },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );

  const refreshToken = jwt.sign(
    { ...base, type: "refresh" },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "30d" }
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  if (payload.type !== "access") throw new Error("wrong token type");
  return payload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET!
  ) as TokenPayload;
  if (payload.type !== "refresh") throw new Error("wrong token type");
  return payload;
}
