import express from "express";
import { handleWhatsAppMessage } from "../services/whatsapp.service.js";
import { handleTelegramUpdate } from "../services/telegram.service.js";
import { verifyWebhookSignature } from "../lib/wasender.js";

const router = express.Router();

/**
 * WaSender WhatsApp Webhook
 * Configure in WaSender Dashboard → Sessions → Staffbot → Manage Webhook
 * URL: https://staffbot.trainly.me/webhooks/whatsapp
 */
router.post("/whatsapp", (req, res) => {
  res.sendStatus(200); // ACK immediately

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  if (process.env.WASENDER_WEBHOOK_SECRET && signature !== process.env.WASENDER_WEBHOOK_SECRET) {
    console.warn("[webhook/wa] invalid signature — ignoring");
    return;
  }
  const payload = req.body;
  const event   = payload?.event;

  // WaSender payload structure:
  // payload.data.messages.key.cleanedSenderPn  → phone
  // payload.data.messages.message.conversation → text
  // payload.data.messages.key.id               → messageId
  // payload.data.messages.key.fromMe           → outgoing flag

  if (event === "messages.received" || event === "messages.upsert") {
    const msg = payload?.data?.messages;
    if (!msg) return;
    if (msg.key?.fromMe) return; // skip outgoing

    const from = msg.key?.cleanedSenderPn
      ?? msg.key?.senderPn?.replace("@s.whatsapp.net", "")
      ?? msg.key?.remoteJid?.replace("@s.whatsapp.net", "").replace("@c.us", "")
      ?? "";

    const text = msg.message?.conversation
      ?? msg.message?.extendedTextMessage?.text
      ?? msg.messageBody
      ?? "";

    const messageId = msg.key?.id ?? "";
    const isGroup   = msg.key?.remoteJid?.endsWith("@g.us") ?? false;

    if (!from || !text) {
      console.log("[webhook/wa] skipping — no from or text", { from, text: text?.slice(0, 20) });
      return;
    }

    console.log(`[webhook/wa] message from ${from}: "${text.slice(0, 50)}"`);

    handleWhatsAppMessage({
      from,
      waMessageId: messageId,
      text,
      messageType: "text",
      groupJid: isGroup ? msg.key?.remoteJid : undefined,
    }).catch(err => console.error("[webhook/wa] pipeline error:", err));
    return;
  }

  if (event === "group-message-received") {
    const msg = payload?.data?.messages ?? payload?.data;
    if (!msg || msg.key?.fromMe) return;

    const from     = msg.key?.cleanedSenderPn
      ?? msg.key?.participant?.replace("@s.whatsapp.net", "")
      ?? "";
    const groupJid  = msg.key?.remoteJid ?? "";
    const text      = msg.message?.conversation
      ?? msg.message?.extendedTextMessage?.text
      ?? msg.messageBody ?? "";
    const messageId = msg.key?.id ?? "";

    if (!from || !text) return;

    console.log(`[webhook/wa/group] ${from} in ${groupJid}: "${text.slice(0, 50)}"`);

    handleWhatsAppMessage({
      from, waMessageId: messageId, text,
      messageType: "text", groupJid,
    }).catch(err => console.error("[webhook/wa/group] error:", err));
  }
});

// Keep backward compat for Meta-style webhook verification
router.get("/whatsapp", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.STAFFBOT_WA_VERIFY_TOKEN;
  const mode        = req.query["hub.mode"];
  const token       = req.query["hub.verify_token"];
  const challenge   = req.query["hub.challenge"];
  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.get("/whatsapp/:tenantSlug", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.STAFFBOT_WA_VERIFY_TOKEN;
  if (req.query["hub.verify_token"] === verifyToken) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Telegram webhook
router.post("/telegram", (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (!update?.message) return;
  handleTelegramUpdate(update).catch(err =>
    console.error("[webhook/telegram] error:", err)
  );
});

export default router;
