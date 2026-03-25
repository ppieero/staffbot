import { Request, Response, NextFunction } from "express";

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}

export function requireCompanyAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const allowed = ["super_admin", "company_admin"];
  if (!req.user || !allowed.includes(req.user.role)) {
    res.status(403).json({ error: "Company admin access required" });
    return;
  }
  next();
}

/**
 * Ensures the authenticated user belongs to the given tenantId.
 * Super admins bypass this check.
 */
export function requireTenant(tenantId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role === "super_admin") {
      next();
      return;
    }
    if (req.user.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied for this tenant" });
      return;
    }
    next();
  };
}
