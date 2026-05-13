import { Client } from "@notionhq/client";
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.NOTION_ENCRYPTION_KEY;
  if (!key) throw new Error("NOTION_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) throw new Error("NOTION_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return buf;
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(":");
  if (!ivHex || !encHex) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function getNotionOAuthUrl(state: string): string {
  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error("NOTION_CLIENT_ID and NOTION_REDIRECT_URI must be set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

export async function exchangeNotionCode(code: string): Promise<{
  access_token: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  bot_id: string;
}> {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Notion OAuth env vars not configured");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion token exchange failed: ${body}`);
  }

  return res.json() as Promise<{
    access_token: string;
    workspace_id: string;
    workspace_name: string;
    workspace_icon: string | null;
    bot_id: string;
  }>;
}

export function createNotionClient(accessToken: string): Client {
  return new Client({ auth: accessToken });
}

export async function listNotionObjects(accessToken: string): Promise<
  Array<{ id: string; title: string; type: "database" | "page"; icon: string | null }>
> {
  const client = createNotionClient(accessToken);
  const results: Array<{ id: string; title: string; type: "database" | "page"; icon: string | null }> = [];

  // Fetch data sources (databases in SDK v5)
  let dsCursor: string | undefined;
  do {
    const res = await client.search({
      filter: { value: "data_source", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      start_cursor: dsCursor,
      page_size: 50,
    });

    for (const item of res.results) {
      if (item.object === "data_source" && "title" in item) {
        const ds = item as { object: "data_source"; id: string; title: Array<{ plain_text: string }>; icon?: { type: string; emoji?: string } | null };
        results.push({
          id: ds.id,
          title: ds.title.map((t) => t.plain_text).join("") || "Sin título",
          type: "database",
          icon: ds.icon?.type === "emoji" ? (ds.icon.emoji ?? null) : null,
        });
      }
    }
    dsCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (dsCursor);

  // Fetch pages
  let pageCursor: string | undefined;
  do {
    const res = await client.search({
      filter: { value: "page", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      start_cursor: pageCursor,
      page_size: 50,
    });

    for (const item of res.results) {
      if (item.object === "page" && "properties" in item) {
        const page = item as { object: "page"; id: string; properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }>; icon?: { type: string; emoji?: string } | null };
        const titleProp = Object.values(page.properties).find((p) => p.type === "title");
        const title = titleProp?.title?.map((t) => t.plain_text).join("") || "Sin título";
        results.push({
          id: page.id,
          title,
          type: "page",
          icon: page.icon?.type === "emoji" ? (page.icon.emoji ?? null) : null,
        });
      }
    }
    pageCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (pageCursor);

  return results;
}

export async function extractNotionPageText(accessToken: string, pageId: string): Promise<string> {
  const client = createNotionClient(accessToken);
  const lines: string[] = [];

  async function processBlocks(blockId: string) {
    let cursor: string | undefined;
    do {
      const res = await client.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
      for (const block of res.results) {
        if (!("type" in block)) continue;
        const text = extractBlockText(block as Parameters<typeof extractBlockText>[0]);
        if (text) lines.push(text);
        if ("has_children" in block && block.has_children) {
          await processBlocks(block.id);
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  await processBlocks(pageId);
  return lines.join("\n");
}

export async function extractNotionDatabaseText(accessToken: string, databaseId: string): Promise<string> {
  const client = createNotionClient(accessToken);
  const lines: string[] = [];

  let cursor: string | undefined;
  do {
    // In SDK v5 databases are "data sources" — query via dataSources.query
    const res = await client.dataSources.query({ data_source_id: databaseId, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      if (!("properties" in page)) continue;
      const rowParts: string[] = [];
      for (const [key, prop] of Object.entries(page.properties)) {
        const val = extractPropertyText(prop as Parameters<typeof extractPropertyText>[0]);
        if (val) rowParts.push(`${key}: ${val}`);
      }
      if (rowParts.length) lines.push(rowParts.join(" | "));
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return lines.join("\n");
}

type AnyBlock = Awaited<ReturnType<Client["blocks"]["children"]["list"]>>["results"][number];

function extractBlockText(block: AnyBlock): string {
  if (!("type" in block)) return "";
  const b = block as { type: string; [key: string]: unknown };
  const content = b[b.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
  if (!content || !content.rich_text) return "";
  return content.rich_text.map((t) => t.plain_text).join("");
}

type AnyProperty = { type: string; [key: string]: unknown };

function extractPropertyText(prop: AnyProperty): string {
  switch (prop.type) {
    case "title":
    case "rich_text":
      return ((prop[prop.type] as Array<{ plain_text: string }>) ?? []).map((t) => t.plain_text).join("");
    case "select":
      return (prop.select as { name?: string } | null)?.name ?? "";
    case "multi_select":
      return ((prop.multi_select as Array<{ name: string }>) ?? []).map((s) => s.name).join(", ");
    case "date": {
      const d = prop.date as { start?: string; end?: string } | null;
      if (!d) return "";
      return d.end ? `${d.start} → ${d.end}` : (d.start ?? "");
    }
    case "number":
      return String(prop.number ?? "");
    case "checkbox":
      return prop.checkbox ? "Sí" : "No";
    case "url":
      return String(prop.url ?? "");
    case "email":
      return String(prop.email ?? "");
    case "phone_number":
      return String(prop.phone_number ?? "");
    case "people":
      return ((prop.people as Array<{ name?: string }>) ?? []).map((p) => p.name ?? "").join(", ");
    default:
      return "";
  }
}
