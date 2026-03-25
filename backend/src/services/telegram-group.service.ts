/**
 * Notifies an employee via Telegram DM that a new profile group has been assigned.
 * Note: Telegram Bot API does not support programmatic group creation.
 * We use the employee's DM chat as a profile-scoped channel instead.
 */

const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function createTelegramGroup(
  groupName: string,
  employeeTelegramId: number,
): Promise<{ success: boolean; groupId?: number; groupName?: string; reason?: string }> {
  try {
    const res = await fetch(`${BASE}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:    employeeTelegramId,
        text:       `🎯 *Nuevo perfil asignado: ${groupName}*\n\nSe te ha asignado este perfil. El asistente responderá usando el conocimiento de *${groupName}*.\n\n¿En qué puedo ayudarte?`,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, reason: `Telegram API error: ${JSON.stringify(err)}` };
    }

    return {
      success:   true,
      groupId:   employeeTelegramId,
      groupName,
    };
  } catch (err: any) {
    return { success: false, reason: err.message };
  }
}
