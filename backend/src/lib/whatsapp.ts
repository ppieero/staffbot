/**
 * WhatsApp Cloud API client — central StaffBot number.
 * Uses STAFFBOT_WA_PHONE_NUMBER_ID / STAFFBOT_WA_ACCESS_TOKEN from env.
 */

const VERSION  = process.env.WHATSAPP_API_VERSION ?? "v19.0";
const WA_MAX_LEN = 4000;

function graphUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
}

function centralCreds(): { phoneNumberId: string; accessToken: string } {
  const phoneNumberId = process.env.STAFFBOT_WA_PHONE_NUMBER_ID;
  const accessToken   = process.env.STAFFBOT_WA_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "StaffBot central WhatsApp credentials not set " +
      "(STAFFBOT_WA_PHONE_NUMBER_ID / STAFFBOT_WA_ACCESS_TOKEN)"
    );
  }
  return { phoneNumberId, accessToken };
}

async function graphPost(phoneNumberId: string, token: string, body: object): Promise<void> {
  const res = await fetch(graphUrl(phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${text}`);
  }
}

function splitMessage(text: string): string[] {
  if (text.length <= WA_MAX_LEN) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > WA_MAX_LEN) {
    let cut = remaining.lastIndexOf("\n", WA_MAX_LEN);
    if (cut <= 0) cut = WA_MAX_LEN;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}

/**
 * Send a plain-text message via the central StaffBot number.
 * Splits automatically if text exceeds WA_MAX_LEN characters.
 */
export async function sendText(to: string, text: string): Promise<void> {
  const { phoneNumberId, accessToken } = centralCreds();
  for (const part of splitMessage(text)) {
    await graphPost(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: part, preview_url: false },
    });
  }
}

/** Mark a received message as read (shows blue ticks). Best-effort — never throws. */
export async function markAsRead(messageId: string): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = centralCreds();
    await graphPost(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  } catch {
    // non-critical — silently ignore
  }
}
