/**
 * Telegram Bot API client — central StaffBot bot (@StaffBotApp_bot).
 */

import { mdToTelegramHtml, splitHtmlMessage } from "./telegram-format.js";

function base() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return `https://api.telegram.org/bot${token}`;
}

/**
 * Send a text message.
 * Converts markdown to Telegram HTML and splits at 4096 chars if needed.
 */
export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  const html   = mdToTelegramHtml(text);
  const chunks = splitHtmlMessage(html);

  for (const chunk of chunks) {
    const res = await fetch(`${base()}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { description?: string };
      // If Telegram rejects the HTML (e.g. malformed tags from LLM), fall back to plain text
      if (err.description?.includes("can't parse entities")) {
        const plain = await fetch(`${base()}/sendMessage`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk }),
        });
        if (!plain.ok) throw new Error(`Telegram sendMessage error: ${JSON.stringify(await plain.json().catch(() => ({})))}`);
      } else {
        throw new Error(`Telegram sendMessage error: ${JSON.stringify(err)}`);
      }
    }
  }
}

/** Send a photo by URL. */
export async function sendPhoto(chatId: number | string, photoUrl: string, caption?: string): Promise<void> {
  const res = await fetch(`${base()}/sendPhoto`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      chat_id:    chatId,
      photo:      photoUrl,
      ...(caption ? { caption, parse_mode: "HTML" } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { description?: string };
    throw new Error(`Telegram sendPhoto error: ${JSON.stringify(err)}`);
  }
}

/** Show "typing…" indicator. Fire-and-forget — never throws. */
export async function sendTypingAction(chatId: number | string): Promise<void> {
  await fetch(`${base()}/sendChatAction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}
