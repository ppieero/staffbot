import { db } from "../db/index.js";
import { employees, employeeProfiles, positionProfiles, tenants } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sendText } from "../lib/wasender.js";
import { sendMessage } from "../lib/telegram.js";

function buildWelcomeMessage(params: {
  firstName:   string;
  profileName: string;
  tenantName:  string;
  language:    string;
}): string {
  const { firstName, profileName, tenantName, language } = params;

  const messages: Record<string, string> = {
    es: `👋 ¡Hola ${firstName}!

Soy *StaffBot*, tu asistente de soporte de *${tenantName}*.

Estoy aquí para ayudarte en todo lo relacionado con tu rol como *${profileName}* 💼

Puedes escribirme cuando quieras — estoy disponible las 24 horas para responder tus dudas, guiarte en procesos y ayudarte con todo lo que necesites.

¡No dudes en escribirme! 🚀`,

    en: `👋 Hey ${firstName}!

I'm *StaffBot*, your support assistant at *${tenantName}*.

I'm here to help you with everything related to your role as *${profileName}* 💼

Feel free to message me anytime — I'm available 24/7 to answer your questions, guide you through processes, and help with whatever you need.

Just write to me whenever! 🚀`,

    fr: `👋 Bonjour ${firstName}!

Je suis *StaffBot*, votre assistant de support chez *${tenantName}*.

Je suis ici pour vous aider avec tout ce qui concerne votre rôle de *${profileName}* 💼

Vous pouvez m'écrire quand vous voulez — je suis disponible 24h/24 pour répondre à vos questions et vous guider.

N'hésitez pas! 🚀`,

    pt: `👋 Olá ${firstName}!

Sou o *StaffBot*, seu assistente de suporte na *${tenantName}*.

Estou aqui para ajudar com tudo relacionado ao seu cargo como *${profileName}* 💼

Pode me escrever quando quiser — estou disponível 24 horas para responder suas dúvidas e ajudar no que precisar.

Pode falar! 🚀`,
  };

  return messages[language] ?? messages.es;
}

export async function sendWelcomeMessage(employeeId: string): Promise<{
  sent: boolean;
  channel?: string;
  reason?: string;
}> {
  try {
    const [employee] = await db
      .select({
        id:               employees.id,
        firstName:        employees.firstName,
        lastName:         employees.lastName,
        phoneWhatsapp:    employees.phoneWhatsapp,
        telegramUserId:   employees.telegramUserId,
        languagePref:     employees.languagePref,
        preferredChannel: employees.preferredChannel,
        tenantId:         employees.tenantId,
        profileId:        employees.profileId,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) return { sent: false, reason: "Employee not found" };

    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, employee.tenantId))
      .limit(1);

    // Resolve profile name: primary assigned > first assigned > fallback from employees.profileId
    let profileName = "your role";
    const assigned = await db
      .select({ name: positionProfiles.name, isPrimary: employeeProfiles.isPrimary })
      .from(employeeProfiles)
      .innerJoin(positionProfiles, eq(employeeProfiles.profileId, positionProfiles.id))
      .where(eq(employeeProfiles.employeeId, employeeId));

    const primary = assigned.find(p => p.isPrimary) ?? assigned[0];
    if (primary?.name) {
      profileName = primary.name;
    } else if (employee.profileId) {
      const [prof] = await db
        .select({ name: positionProfiles.name })
        .from(positionProfiles)
        .where(eq(positionProfiles.id, employee.profileId))
        .limit(1);
      if (prof?.name) profileName = prof.name;
    }

    const message = buildWelcomeMessage({
      firstName:   employee.firstName,
      profileName,
      tenantName:  tenant?.name ?? "your company",
      language:    employee.languagePref ?? "es",
    });

    const channel = employee.preferredChannel ?? "whatsapp";

    if (channel === "telegram") {
      if (!employee.telegramUserId) {
        return { sent: false, reason: "Employee has no Telegram ID linked yet" };
      }
      await sendMessage(parseInt(employee.telegramUserId), message);
      console.log(`[welcome] sent via Telegram to ${employee.firstName} ${employee.lastName}`);
      return { sent: true, channel: "telegram" };
    } else {
      if (!employee.phoneWhatsapp) {
        return { sent: false, reason: "Employee has no WhatsApp number" };
      }
      await sendText(employee.phoneWhatsapp, message);
      console.log(`[welcome] sent via WhatsApp to ${employee.firstName} ${employee.lastName}`);
      return { sent: true, channel: "whatsapp" };
    }
  } catch (err: any) {
    console.error("[welcome] error:", err?.message);
    return { sent: false, reason: err.message };
  }
}
