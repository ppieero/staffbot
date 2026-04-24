import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  conversations, employees, employeeProfiles,
  messages, positionProfiles, tenants,
} from "../db/schema.js";
import { sendText, sendImageUrl } from "../lib/wasender.js";
import { verifyCode } from "./whatsapp-verification.service.js";

const RAG_URL     = process.env.RAG_ENGINE_URL ?? "http://localhost:8000";
const RAG_TIMEOUT = 30_000;

const LANG_INSTRUCTION: Record<string, string> = {
  en: "IMPORTANT: You MUST respond in English.",
  es: "IMPORTANTE: Debes responder en español.",
  fr: "IMPORTANT: Tu DOIS répondre en français.",
  pt: "IMPORTANTE: Deves responder em português.",
  de: "WICHTIG: Du MUSST auf Deutsch antworten.",
};

function langInstruction(lang: string | null | undefined): string {
  return LANG_INSTRUCTION[lang ?? "es"] ?? `IMPORTANT: Respond in the language code "${lang}".`;
}

export interface IncomingMessage {
  from:        string; // phone number digits only
  waMessageId: string;
  text:        string;
  messageType: string;
  groupJid?:   string; // set if message came from a group
}

export async function handleWhatsAppMessage(params: IncomingMessage): Promise<void> {
  const phone = params.from.replace(/\D/g, "");

  // 1. Find employee by phone (across ALL tenants — central number)
  const [employee] = await db
    .select({
      id:               employees.id,
      firstName:        employees.firstName,
      lastName:         employees.lastName,
      status:           employees.status,
      languagePref:     employees.languagePref,
      tenantId:         employees.tenantId,
      profileId:        employees.profileId,
      preferredChannel: employees.preferredChannel,
    })
    .from(employees)
    .where(eq(employees.phoneWhatsapp, phone))
    .limit(1);

  if (!employee) {
    console.warn(`[wa] unknown phone: ${phone}`);
    await sendText(params.from,
      "❌ Your number is not registered in StaffBot. Please contact your HR department."
    ).catch(() => {});
    return;
  }

  // Check preferred channel — only respond on WhatsApp if that's their channel
  if (employee.preferredChannel === "telegram") {
    await sendText(params.from,
      "ℹ️ Your account is configured to use Telegram. Please contact the assistant via @StaffBotApp_bot."
    ).catch(() => {});
    return;
  }

  if (employee.status === "inactive") {
    await sendText(params.from, "⚠️ Your account is currently inactive. Please contact HR.").catch(() => {});
    return;
  }

  // 2. Get tenant
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, employee.tenantId))
    .limit(1);

  if (!tenant || tenant.status !== "active") {
    await sendText(params.from, "⚠️ Your company account is not active.").catch(() => {});
    return;
  }

  // 3. Non-text message
  if (params.messageType !== "text" || !params.text?.trim()) {
    const replies: Record<string, string> = {
      es: "Por ahora solo puedo responder mensajes de texto. ¿En qué puedo ayudarte?",
      en: "I can only respond to text messages for now. How can I help you?",
      fr: "Je ne peux répondre qu'aux messages texte. Comment puis-je vous aider?",
      pt: "Por enquanto só consigo responder mensagens de texto. Como posso ajudar?",
    };
    await sendText(params.from, replies[employee.languagePref ?? "es"] ?? replies.es).catch(() => {});
    return;
  }

  const text = params.text.trim();

  // 4. Check verification code
  if (/^\d{6}$/.test(text)) {
    const ok = await verifyCode(employee.id, text);
    const reply = ok
      ? "✅ ¡Número verificado! Ya puedes usar el asistente. ¿En qué puedo ayudarte?"
      : "❌ Código incorrecto o expirado. Solicita uno nuevo a tu administrador.";
    await sendText(params.from, reply).catch(() => {});
    return;
  }

  // 5. Get profiles — if message from group, use group-specific profile
  let systemPrompt = "";
  let profileId    = "default";

  if (params.groupJid) {
    // Find profile by group JID
    const [epRow] = await db
      .select({ profileId: employeeProfiles.profileId })
      .from(employeeProfiles)
      .where(eq(employeeProfiles.waGroupJid, params.groupJid))
      .limit(1);
    if (epRow) {
      profileId = epRow.profileId;
      const [prof] = await db
        .select({ systemPrompt: positionProfiles.systemPrompt })
        .from(positionProfiles)
        .where(eq(positionProfiles.id, profileId))
        .limit(1);
      systemPrompt = prof?.systemPrompt ?? "";
    }
  } else {
    // Use primary or first assigned profile
    const assigned = await db
      .select({ profileId: employeeProfiles.profileId, isPrimary: employeeProfiles.isPrimary, systemPrompt: positionProfiles.systemPrompt })
      .from(employeeProfiles)
      .innerJoin(positionProfiles, eq(employeeProfiles.profileId, positionProfiles.id))
      .where(eq(employeeProfiles.employeeId, employee.id));
    const primary = assigned.find(p => p.isPrimary) ?? assigned[0];
    if (primary) { profileId = primary.profileId; systemPrompt = primary.systemPrompt ?? ""; }
    else if (employee.profileId) profileId = employee.profileId;
  }

  // 6. Get/create conversation
  let [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenant.id), eq(conversations.employeeId, employee.id), eq(conversations.status, "open")))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({ tenantId: tenant.id, employeeId: employee.id, channel: "whatsapp", status: "open" })
      .returning();
  }

  // 7. Load history
  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.sentAt))
    .limit(6)
    .then(r => r.reverse());

  // 8. Save user message
  await db.insert(messages).values({
    conversationId: conversation.id,
    role:           "user",
    content:        text,
  });

  // 9. Query RAG
  let answer       = "";
  let ragMeta:     Record<string, unknown>   = {};
  let ragImages:   Array<{ url: string }>    = [];
  let ragVideos:   string[]                  = [];
  let tokensInput  = 0;
  let tokensOutput = 0;

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), RAG_TIMEOUT);
    const ragRes = await fetch(`${RAG_URL}/query`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenant.id, profile_id: profileId,
        question: text,
        system_prompt: (systemPrompt ? systemPrompt + "\n\n" : "") +
          "IMPORTANT: You are responding via WhatsApp messaging. Keep responses concise and conversational. Maximum 3-4 paragraphs.\n\n" +
          langInstruction(employee.languagePref),
        conversation_history: history, embed_provider: "openai",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (ragRes.ok) {
      const data = await ragRes.json() as Record<string, unknown>;
      answer       = (data.answer as string) ?? "";
      tokensInput  = (data.tokens_input  as number) ?? 0;
      tokensOutput = (data.tokens_output as number) ?? 0;
      ragMeta      = { sources: data.sources, tokensUsed: data.tokens_used, tokensInput, tokensOutput, latencyMs: data.latency_ms };
      ragImages    = (data.images     as Array<{ url: string }>) ?? [];
      ragVideos    = (data.video_urls as string[]) ?? [];
    } else throw new Error(`RAG ${ragRes.status}`);
  } catch (err: any) {
    console.error("[wa] RAG error:", err?.message);
    const fallbacks: Record<string, string> = {
      es: "Lo siento, tuve un problema. Por favor intenta de nuevo.",
      en: "Sorry, I had a problem. Please try again.",
      fr: "Désolé, j'ai eu un problème. Veuillez réessayer.",
      pt: "Desculpe, ocorreu um problema. Por favor, tente novamente.",
    };
    answer = fallbacks[employee.languagePref ?? "es"] ?? fallbacks.es;
  }

  // 10. Save + update + send
  await db.insert(messages).values({
    conversationId: conversation.id,
    role:           "assistant",
    content:        answer,
    sources:        (ragMeta.sources as Record<string, unknown>[]) ?? null,
    tokensUsed:     ((ragMeta.tokensUsed as number) ?? 0) || undefined,
    tokensInput:    tokensInput || undefined,
    tokensOutput:   tokensOutput || undefined,
    latencyMs:      (ragMeta.latencyMs as number) ?? undefined,
  });
  await db.update(conversations).set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  // Random delay 2–15s to simulate natural response time
  const delayMs = (Math.floor(Math.random() * 14) + 2) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));

  // Send to group or personal chat
  const replyTo = params.groupJid ?? params.from;
  await sendText(replyTo, answer);

  // Send images from document (up to 2).
  // WaSender account-protection enforces 1 msg/5s — wait 6s before each image.
  for (const img of ragImages.slice(0, 2)) {
    await new Promise(resolve => setTimeout(resolve, 6000));
    await sendImageUrl(replyTo, img.url).catch((e: Error) =>
      console.warn("[wa] image send failed:", e.message)
    );
  }
  // Send video links as text
  if (ragVideos.length > 0) {
    await sendText(replyTo, "🎥 " + ragVideos.slice(0, 3).join("\n🎥 ")).catch(() => {});
  }

  console.log(`[wa] replied to ${phone} (${tenant.name}) in ${ragMeta.latencyMs ?? "?"}ms | imgs:${ragImages.length} vids:${ragVideos.length}`);
}
