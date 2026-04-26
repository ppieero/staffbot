import { db } from "../db/index.js";
import { manuals, manualSections, tenants } from "../db/schema.js";
import { eq } from "drizzle-orm";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const COLLECTION = "staffbot_openai";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function embed(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY ?? "";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`OpenAI embed error: ${res.status}`);
  const data: any = await res.json();
  return data.data[0].embedding;
}

async function deleteManualVectors(manualId: string): Promise<void> {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ filter: { must: [{ key: "manual_id", match: { value: manualId } }] } }),
  });
}

export async function indexManual(manualId: string): Promise<{ chunks: number }> {
  const [manual] = await db.select().from(manuals).where(eq(manuals.id, manualId)).limit(1);
  if (!manual) throw new Error("Manual not found");

  const sections = await db
    .select()
    .from(manualSections)
    .where(eq(manualSections.manualId, manualId))
    .orderBy(manualSections.orderIndex);

  if (!sections.length) throw new Error("No sections to index");

  let tenantSlug = manual.tenantSlug;
  if (!tenantSlug) {
    const [tenant] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, manual.tenantId)).limit(1);
    tenantSlug = tenant?.slug ?? "unknown";
  }

  await deleteManualVectors(manualId);

  const points: any[] = [];

  for (const section of sections) {
    const plain    = stripHtml(section.contentHtml);
    const fullText = `${section.title}\n\n${plain}`;
    if (fullText.trim().length < 20) continue;

    const vector = await embed(fullText);

    points.push({
      id:      section.id,
      vector,
      payload: {
        source_type:    "manual_section",
        tenant_id:      manual.tenantId,
        manual_id:      manual.id,
        section_id:     section.id,
        section_title:  section.title,
        section_index:  section.orderIndex,
        total_sections: sections.length,
        section_type:   section.sectionType,
        manual_title:   manual.title,
        manual_slug:    manual.slug,
        tenant_slug:    tenantSlug,
        profile_ids:    manual.profileIds ?? [],
        // profile_id is first entry for backward-compat with the existing Qdrant filter
        profile_id:     (manual.profileIds ?? [])[0] ?? null,
        text:           fullText,
        text_preview:   fullText.slice(0, 200),
        images:         section.images ?? [],
        video_urls:     [],
        embed_provider: "openai",
      },
    });
  }

  if (!points.length) throw new Error("No indexable sections found");

  const BATCH = 10;
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ points: batch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Qdrant upsert error: ${JSON.stringify(err)}`);
    }
  }

  await db.update(manuals).set({
    ragIndexed: true,
    ragChunks:  points.length,
    tenantSlug,
    updatedAt:  new Date(),
  }).where(eq(manuals.id, manualId));

  console.log(`[manual-indexer] Indexed ${points.length} sections for manual ${manualId}`);
  return { chunks: points.length };
}

export async function deindexManual(manualId: string): Promise<void> {
  await deleteManualVectors(manualId);
  await db.update(manuals).set({ ragIndexed: false, ragChunks: 0 }).where(eq(manuals.id, manualId));
  console.log(`[manual-indexer] Removed RAG vectors for manual ${manualId}`);
}
