import { db } from "../db/index.js";
import { employees, tenants } from "../db/schema.js";
import { eq } from "drizzle-orm";

function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  let code = "LINK-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. LINK-K7MN2P
}

export async function generateTelegramLinkCode(employeeId: string): Promise<string> {
  const code    = generateLinkCode();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.update(employees)
    .set({
      telegramLinkCode:    code,
      telegramLinkExpires: expires,
    })
    .where(eq(employees.id, employeeId));

  return code;
}

export async function resolveTelegramLinkCode(
  code: string,
  telegramUserId: string,
): Promise<{ success: boolean; employeeName?: string; tenantName?: string; reason?: string }> {
  const [employee] = await db
    .select({
      id:                  employees.id,
      firstName:           employees.firstName,
      lastName:            employees.lastName,
      telegramLinkCode:    employees.telegramLinkCode,
      telegramLinkExpires: employees.telegramLinkExpires,
      telegramUserId:      employees.telegramUserId,
      tenantId:            employees.tenantId,
    })
    .from(employees)
    .where(eq(employees.telegramLinkCode, code.toUpperCase().trim()))
    .limit(1);

  if (!employee) {
    return { success: false, reason: "Invalid code. Check the code and try again." };
  }

  if (employee.telegramLinkExpires && new Date() > employee.telegramLinkExpires) {
    return { success: false, reason: "This code has expired. Ask your administrator for a new one." };
  }

  if (employee.telegramUserId && employee.telegramUserId !== telegramUserId) {
    return { success: false, reason: "This code has already been used with a different account." };
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, employee.tenantId))
    .limit(1);

  await db.update(employees)
    .set({
      telegramUserId:      telegramUserId,
      telegramLinkedAt:    new Date(),
      telegramLinkCode:    null,
      telegramLinkExpires: null,
    })
    .where(eq(employees.id, employee.id));

  return {
    success:      true,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    tenantName:   tenant?.name,
  };
}
