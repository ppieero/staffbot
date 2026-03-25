import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { conversations, employees, employeeProfiles, messages, positionProfiles, tenants } from "../db/schema";
import { sendMessage, sendPhoto, sendTypingAction } from "../lib/telegram";
import { resolveTelegramLinkCode } from "./telegram-link.service.js";

const RAG_URL     = process.env.RAG_ENGINE_URL ?? "http://localhost:8000";
const MAX_HISTORY = 6;

// ─── Localised strings ────────────────────────────────────────────────────────

const MSG_NOT_REGISTERED: Record<string, string> = {
  es: "👋 Tu ID de Telegram no está registrado. Muéstrale este número a tu empresa para que te registren:\n`{id}`",
  en: "👋 Your Telegram ID is not registered. Show your company this number to get registered:\n`{id}`",
  pt: "👋 Seu ID do Telegram não está registrado. Mostre este número para sua empresa:\n`{id}`",
};
const MSG_INACTIVE: Record<string, string> = {
  es: "⚠️ Tu cuenta está inactiva. Por favor contacta a tu administrador.",
  en: "⚠️ Your account is currently inactive. Please contact your administrator.",
  pt: "⚠️ Sua conta está inativa. Por favor, contate o administrador.",
};
const MSG_TENANT_INACTIVE: Record<string, string> = {
  es: "⚠️ La cuenta de tu empresa no está activa. Contacta a tu administrador.",
  en: "⚠️ Your company account is not active. Please contact your administrator.",
  pt: "⚠️ A conta da sua empresa não está ativa. Contate seu administrador.",
};
const MSG_ERROR: Record<string, string> = {
  es: "Lo siento, tuve un problema al procesar tu consulta. Por favor intenta de nuevo.",
  en: "Sorry, I had a problem processing your request. Please try again.",
  pt: "Desculpe, ocorreu um problema. Por favor, tente novamente.",
};
const MSG_START: Record<string, string> = {
  es: "👋 ¡Hola {name}! Soy el asistente de **{tenant}**. ¿En qué puedo ayudarte?",
  en: "👋 Hi {name}! I'm the **{tenant}** assistant. How can I help you?",
  fr: "👋 Bonjour {name}! Je suis l'assistant de **{tenant}**. Comment puis-je vous aider?",
  pt: "👋 Olá {name}! Sou o assistente de **{tenant}**. Como posso ajudar?",
};
const MSG_HELP: Record<string, string> = {
  es: "**Ayuda de StaffBot**\n\nEnvíame cualquier pregunta sobre políticas, procedimientos o tu trabajo.\n\nComandos:\n/start — Reiniciar\n/help — Esta ayuda",
  en: "**StaffBot Help**\n\nSend me any question about policies, procedures, or your work.\n\nCommands:\n/start — Restart\n/help — This message",
  pt: "**Ajuda StaffBot**\n\nEnvie qualquer pergunta sobre políticas ou procedimentos.\n\nComandos:\n/start — Reiniciar\n/help — Esta ajuda",
};

function t(map: Record<string, string>, lang: string, vars?: Record<string, string>): string {
  let s = map[lang] ?? map.en ?? map.es ?? Object.values(map)[0];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, v);
    }
  }
  return s;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id:         number;
      first_name: string;
      last_name?:  string;
      username?:   string;
    };
    chat: { id: number; type: string };
    text?: string;
    date:  number;
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return;

  const telegramUserId = String(msg.from.id);
  const chatId         = msg.chat.id;
  const text           = msg.text.trim();

  // ── 1. Find employee by Telegram user ID ─────────────────────────────────
  const [employee] = await db
    .select({
      id:           employees.id,
      firstName:    employees.firstName,
      status:       employees.status,
      languagePref: employees.languagePref,
      tenantId:     employees.tenantId,
      profileId:    employees.profileId,
    })
    .from(employees)
    .where(eq(employees.telegramUserId, telegramUserId))
    .limit(1);

  if (!employee) {
    // Check if the message is a LINK code (format: LINK-XXXXXX)
    if (/^LINK-[A-Z0-9]{6}$/i.test(text)) {
      const result = await resolveTelegramLinkCode(text, telegramUserId);
      if (result.success) {
        const successMsgs: Record<string, string> = {
          es: `✅ ¡Cuenta vinculada exitosamente!\n\nHola **${result.employeeName}**, soy tu asistente de **${result.tenantName}**.\n\nYa puedes hacerme preguntas sobre tus funciones, políticas y procedimientos. 💼`,
          en: `✅ Account linked successfully!\n\nHi **${result.employeeName}**, I'm your **${result.tenantName}** assistant.\n\nYou can now ask me questions about your role, policies and procedures. 💼`,
          fr: `✅ Compte lié avec succès!\n\nBonjour **${result.employeeName}**, je suis votre assistant **${result.tenantName}**.\n\nVous pouvez maintenant me poser des questions sur votre rôle et vos procédures. 💼`,
          pt: `✅ Conta vinculada com sucesso!\n\nOlá **${result.employeeName}**, sou seu assistente de **${result.tenantName}**.\n\nAgora pode me fazer perguntas sobre suas funções e procedimentos. 💼`,
        };
        await sendMessage(chatId, successMsgs["es"]);
      } else {
        await sendMessage(chatId, `❌ ${result.reason}`);
      }
      return;
    }

    console.info(`[tg] unknown telegram user: ${telegramUserId}`);
    await sendMessage(chatId, t(MSG_NOT_REGISTERED, "es", { id: telegramUserId })).catch(() => {});
    return;
  }

  const lang = employee.languagePref ?? "es";

  if (employee.status === "inactive") {
    await sendMessage(chatId, t(MSG_INACTIVE, lang)).catch(() => {});
    return;
  }

  // ── 2. Resolve tenant ────────────────────────────────────────────────────
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, employee.tenantId))
    .limit(1);

  if (!tenant || tenant.status !== "active") {
    await sendMessage(chatId, t(MSG_TENANT_INACTIVE, lang)).catch(() => {});
    return;
  }

  // ── 3. Handle bot commands ───────────────────────────────────────────────
  if (text === "/start") {
    await sendMessage(chatId, t(MSG_START, lang, { name: employee.firstName, tenant: tenant.name }));
    return;
  }
  if (text === "/help") {
    await sendMessage(chatId, t(MSG_HELP, lang));
    return;
  }

  // ── 4. Show typing indicator ─────────────────────────────────────────────
  await sendTypingAction(chatId);

  // ── 5. Load position profile — primary > first assigned > fallback to employees.profileId
  let profile: { id: string; systemPrompt: string | null } | null = null;

  const assignedProfiles = await db
    .select({
      id:           positionProfiles.id,
      systemPrompt: positionProfiles.systemPrompt,
      isPrimary:    employeeProfiles.isPrimary,
    })
    .from(employeeProfiles)
    .innerJoin(positionProfiles, eq(employeeProfiles.profileId, positionProfiles.id))
    .where(eq(employeeProfiles.employeeId, employee.id));

  profile = assignedProfiles.find(p => p.isPrimary) ?? assignedProfiles[0] ?? null;

  if (!profile) {
    const [fallback] = await db
      .select({ id: positionProfiles.id, systemPrompt: positionProfiles.systemPrompt })
      .from(positionProfiles)
      .where(eq(positionProfiles.id, employee.profileId))
      .limit(1);
    profile = fallback ?? null;
  }

  if (!profile?.systemPrompt) {
    console.warn(`[tg] no usable system prompt for employee ${employee.id}`);
    await sendMessage(chatId, t(MSG_ERROR, lang)).catch(() => {});
    return;
  }

  // ── 6. Get or create open conversation ───────────────────────────────────
  let [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenant.id),
        eq(conversations.employeeId, employee.id),
        eq(conversations.channel, "telegram"),
        eq(conversations.status, "open"),
      )
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({
        tenantId:      tenant.id,
        employeeId:    employee.id,
        channel:       "telegram",
        status:        "open",
        startedAt:     new Date(),
        lastMessageAt: new Date(),
      })
      .returning();
    console.info(`[tg] new conversation ${conversation.id} for employee ${employee.id}`);
  }

  // ── 7. Load conversation history ──────────────────────────────────────────
  const recent = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.sentAt))
    .limit(MAX_HISTORY);

  const history = recent
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ── 8. Persist user message ───────────────────────────────────────────────
  await db.insert(messages).values({
    conversationId: conversation.id,
    role:           "user",
    content:        text,
    sentAt:         new Date(),
  });

  // ── 9. Query RAG engine ───────────────────────────────────────────────────
  let answer:      string                    = "";
  let sources:     unknown[]                 = [];
  let tokensUsed   = 0;
  let tokensInput  = 0;
  let tokensOutput = 0;
  let latencyMs    = 0;
  let ragImages: Array<{ url: string }>      = [];
  let ragVideos: string[]                    = [];

  try {
    const ragRes = await fetch(`${RAG_URL}/query`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id:            tenant.id,
        profile_id:           profile.id,
        question:             text,
        system_prompt:        profile.systemPrompt,
        conversation_history: history,
        embed_provider:       "openai",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!ragRes.ok) throw new Error(`RAG ${ragRes.status}`);

    const data = await ragRes.json() as Record<string, unknown>;
    answer       = (data.answer        as string)                 ?? "";
    sources      = (data.sources       as unknown[])              ?? [];
    tokensUsed   = (data.tokens_used   as number)                 ?? 0;
    tokensInput  = (data.tokens_input  as number)                 ?? 0;
    tokensOutput = (data.tokens_output as number)                 ?? 0;
    latencyMs    = (data.latency_ms    as number)                 ?? 0;
    ragImages    = (data.images        as Array<{ url: string }>) ?? [];
    ragVideos    = (data.video_urls    as string[])               ?? [];
  } catch (err: any) {
    console.error("[tg] RAG error:", err?.message);
    answer = t(MSG_ERROR, lang);
  }

  // ── 10. Persist assistant reply ───────────────────────────────────────────
  await db.insert(messages).values({
    conversationId: conversation.id,
    role:           "assistant",
    content:        answer,
    sources:        sources as Record<string, unknown>[],
    tokensUsed,
    tokensInput,
    tokensOutput,
    latencyMs,
    sentAt:         new Date(),
  });

  // ── 11. Update conversation timestamp ────────────────────────────────────
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  // ── 12. Send reply ────────────────────────────────────────────────────────
  await sendMessage(chatId, answer);

  // Send images from document (up to 3, fire-and-forget)
  for (const img of ragImages.slice(0, 3)) {
    await sendPhoto(chatId, img.url).catch((e: Error) =>
      console.warn("[tg] photo send failed:", e.message)
    );
  }
  // Send video links as text
  if (ragVideos.length > 0) {
    await sendMessage(chatId, "🎥 " + ragVideos.slice(0, 3).join("\n🎥 ")).catch(() => {});
  }

  console.info(
    `[tg] → ${telegramUserId} (${tenant.name}) | conv:${conversation.id} | ${latencyMs}ms | ${tokensUsed} tokens`
  );
}
