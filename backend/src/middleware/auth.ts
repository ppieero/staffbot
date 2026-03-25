import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/auth.service";
import { redis } from "../lib/redis";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);

    // Reject blocklisted tokens (from logout)
    const blocked = await redis.get(`blocklist:${token}`);
    if (blocked) {
      res.status(401).json({ error: "Token has been revoked" });
      return;
    }

    req.user = payload;
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      res.status(401).json({ error: "Token expired" });
      return;
    }
    res.status(401).json({ error: "Invalid token" });
  }
}
