/**
 * WaSender WhatsApp API client
 * Docs: https://wasenderapi.com/api-docs
 * Session: Staffbot (+351928218049)
 */

const BASE_URL    = process.env.WASENDER_BASE_URL ?? "https://www.wasenderapi.com";
const API_KEY     = () => process.env.WASENDER_API_KEY ?? "";
const MAX_LENGTH  = 4000;

function headers() {
  return {
    "Authorization": `Bearer ${API_KEY()}`,
    "Content-Type":  "application/json",
  };
}

// Format phone for WaSender: strip non-digits
export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Send text message (to personal chat or group JID)
export async function sendText(to: string, text: string): Promise<void> {
  if (!API_KEY()) throw new Error("WASENDER_API_KEY not configured");

  // Split long messages
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    chunks.push(text.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${BASE_URL}/api/send-message`, {
      method:  "POST",
      headers: headers(),
      body:    JSON.stringify({ to: formatPhone(to), text: chunk }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`WaSender error: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(`WaSender send failed: ${JSON.stringify(data)}`);
    }
  }
}

// Send text to group (using group JID)
export async function sendGroupText(groupJid: string, text: string): Promise<void> {
  if (!API_KEY()) throw new Error("WASENDER_API_KEY not configured");

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    chunks.push(text.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${BASE_URL}/api/send-message`, {
      method:  "POST",
      headers: headers(),
      body:    JSON.stringify({ to: groupJid, text: chunk }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`WaSender group send error: ${JSON.stringify(err)}`);
    }
  }
}

// Create WhatsApp group
export async function createGroup(
  name: string,
  participants: string[],
): Promise<{ success: boolean; groupId?: string; groupName?: string; reason?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/groups`, {
      method:  "POST",
      headers: headers(),
      body:    JSON.stringify({
        name,
        participants: participants.map(p => `${formatPhone(p)}@s.whatsapp.net`),
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, reason: JSON.stringify(data) };
    }

    return {
      success:   true,
      groupId:   data.data?.id,
      groupName: data.data?.subject ?? name,
    };
  } catch (err: any) {
    return { success: false, reason: err.message };
  }
}

// Add participant to group
export async function addGroupParticipant(
  groupJid: string,
  phone: string,
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/groups/${encodeURIComponent(groupJid)}/participants/add`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify({ participants: [`${formatPhone(phone)}@s.whatsapp.net`] }),
  });
  const data = await res.json();
  return data.success === true;
}

// Check if phone is on WhatsApp
export async function isOnWhatsApp(phone: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/on-whatsapp/${formatPhone(phone)}`, {
      headers: headers(),
    });
    const data = await res.json();
    return data.success === true && data.data?.exists === true;
  } catch {
    return false;
  }
}

// Send image by URL via WaSender
export async function sendImageUrl(to: string, imageUrl: string, caption?: string): Promise<void> {
  if (!API_KEY()) throw new Error("WASENDER_API_KEY not configured");

  const res = await fetch(`${BASE_URL}/api/send-message`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify({
      to:       formatPhone(to),
      imageUrl,
      ...(caption ? { caption } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WaSender image error: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(`WaSender image send failed: ${JSON.stringify(data)}`);
  }
}

// Verify webhook signature
export function verifyWebhookSignature(signature: string | undefined): boolean {
  const secret = process.env.WASENDER_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return signature === secret;
}
