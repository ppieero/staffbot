import { db } from "../db/index.js";
import { employees, tenants } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sendText } from "../lib/whatsapp.js";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationMessage(employeeId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  try {
    const [employee] = await db
      .select({
        id:            employees.id,
        firstName:     employees.firstName,
        phoneWhatsapp: employees.phoneWhatsapp,
        tenantId:      employees.tenantId,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee)             return { sent: false, reason: "Employee not found" };
    if (!employee.phoneWhatsapp) return { sent: false, reason: "No WhatsApp number" };

    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, employee.tenantId))
      .limit(1);

    const tenantName = tenant?.name ?? "StaffBot";

    // Generate + save code
    const code = generateCode();
    await db
      .update(employees)
      .set({
        whatsappVerificationCode:   code,
        whatsappVerificationSentAt: new Date(),
        whatsappVerified:           false,
      })
      .where(eq(employees.id, employeeId));

    // Send via central number
    const message =
      `👋 Hola ${employee.firstName}!\n\n` +
      `Te registramos en *StaffBot* de *${tenantName}*.\n\n` +
      `Tu código de verificación es: *${code}*\n\n` +
      `Responde con el código para confirmar tu número y activar tu asistente. ✅`;

    await sendText(employee.phoneWhatsapp, message);

    console.log(`[verification] code sent to ${employee.phoneWhatsapp}`);
    return { sent: true };
  } catch (err: any) {
    console.error("[verification] error:", err?.message);
    return { sent: false, reason: err?.message };
  }
}

export async function verifyCode(employeeId: string, code: string): Promise<boolean> {
  const [employee] = await db
    .select({
      whatsappVerificationCode:   employees.whatsappVerificationCode,
      whatsappVerificationSentAt: employees.whatsappVerificationSentAt,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee?.whatsappVerificationCode) return false;
  if (employee.whatsappVerificationCode !== code) return false;

  // Expires after 30 minutes
  if (employee.whatsappVerificationSentAt) {
    const age = Date.now() - new Date(employee.whatsappVerificationSentAt).getTime();
    if (age > 30 * 60 * 1000) return false;
  }

  await db
    .update(employees)
    .set({ whatsappVerified: true, whatsappVerificationCode: null })
    .where(eq(employees.id, employeeId));

  return true;
}
