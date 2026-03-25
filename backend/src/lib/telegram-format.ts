/**
 * Convert LLM markdown to Telegram HTML (parse_mode: "HTML").
 * HTML mode is far more predictable than MarkdownV2 because only
 * explicit tags are interpreted — no escaping minefield.
 *
 * Supported Telegram HTML tags: <b>, <i>, <u>, <s>, <code>, <pre>, <a>
 */

/** Escape characters that are special in Telegram HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mdToTelegramHtml(text: string): string {
  // ── 1. Extract and protect fenced code blocks before any other transforms ──
  const codeBlocks: string[] = [];
  let out = text.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  // ── 2. Extract inline code ──────────────────────────────────────────────────
  const inlineCodes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE${inlineCodes.length - 1}\x00`;
  });

  // ── 3. Escape HTML in the remaining text ───────────────────────────────────
  out = escapeHtml(out);

  // ── 4. Structural transforms ───────────────────────────────────────────────

  // Headers → bold
  out = out.replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");

  // Horizontal rules → blank line
  out = out.replace(/^(?:---+|\*\*\*+|___+)$/gm, "");

  // Blockquotes → italic (strip the leading &gt; that came from HTML-escaping ">")
  // Handle "> _text_" so we don't produce double <i><i>
  out = out.replace(/^&gt;\s*_(.+)_\s*$/gm, "<i>$1</i>");
  out = out.replace(/^&gt;\s*\*(.+)\*\s*$/gm, "<i>$1</i>");
  out = out.replace(/^&gt;\s*(.+)$/gm, "<i>$1</i>");

  // Bold: **text** or __text__
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* (single asterisk, not already consumed) or _text_
  out = out.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  out = out.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  out = out.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Bullet points * / - / + at line start → •
  out = out.replace(/^[*\-+]\s+/gm, "• ");

  // ── 5. Restore protected blocks ────────────────────────────────────────────
  out = out.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlineCodes[Number(i)]);
  out = out.replace(/\x00CODE(\d+)\x00/g,   (_, i) => codeBlocks[Number(i)]);

  // ── 6. Clean up whitespace ─────────────────────────────────────────────────
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  return out;
}

/**
 * Split a long HTML string into chunks ≤ maxLen characters,
 * breaking on newlines where possible to avoid mid-tag splits.
 */
export function splitHtmlMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to break on the last newline within the window
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen; // no newline found, hard cut
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
