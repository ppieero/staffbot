import Anthropic from "@anthropic-ai/sdk";
import { indexManual } from "./manual-indexer.service.js";
import { db } from "../db/index.js";
import { manuals, manualSections } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { TranscriptionResult } from "./video-transcription.service.js";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", fr: "French", pt: "Portuguese", de: "German",
};

interface ImageMeta {
  url:   string;
  index: number;
  page?: number | null;
  ext?:  string;
}

interface ManualSection {
  title:          string;
  type:           "intro" | "steps" | "note" | "checklist" | "content" | "warning";
  content:        string;
  steps?:         string[];
  notes?:         string[];
  checklist?:     string[];
  warning?:       string;
  clip_start?:    number;
  clip_end?:      number;
  image_indices?: number[];
}

interface GeneratedManual {
  title:    string;
  language: string;
  sections: ManualSection[];
}

function buildSectionHtml(section: ManualSection): string {
  let html = `<p class="sb-section-body">${section.content}</p>`;

  if (section.warning) {
    html = `<div class="sb-warning"><span class="sb-warning-icon">⚠</span><div><strong>Safety Warning</strong><p>${section.warning}</p></div></div>` + html;
  }

  if (section.steps?.length) {
    html += `<ol class="sb-steps">${section.steps.map((s, i) =>
      `<li class="sb-step"><span class="sb-step-num">${i + 1}</span><span class="sb-step-text">${s}</span></li>`
    ).join("")}</ol>`;
  }

  if (section.checklist?.length) {
    html += `<ul class="sb-checklist">${section.checklist.map(s =>
      `<li class="sb-check"><span class="sb-check-box"></span><span style="color:#1a1a1a;line-height:1.5">${s}</span></li>`
    ).join("")}</ul>`;
  }

  if (section.notes?.length) {
    html += section.notes.map(n =>
      `<div class="sb-note"><span class="sb-note-label">Note</span><p>${n}</p></div>`
    ).join("");
  }

  return html;
}

async function callClaude(prompt: string, systemPrompt: string): Promise<GeneratedManual> {
  const response = await getClient().messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 8000,
    system:     systemPrompt,
    messages:   [{ role: "user", content: prompt }],
  });

  const rawText = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("");

  const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function saveSections(
  manualId:        string,
  generated:       GeneratedManual,
  extractedImages: ImageMeta[] = [],
): Promise<void> {
  await db.delete(manualSections).where(eq(manualSections.manualId, manualId));

  const MAX_IMAGES_PER_SECTION = 3;

  for (let i = 0; i < generated.sections.length; i++) {
    const s = generated.sections[i];

    let sectionImages: ImageMeta[] = [];

    if (s.image_indices?.length && extractedImages.length > 0) {
      sectionImages = s.image_indices
        .filter(idx => idx >= 0 && idx < extractedImages.length)
        .slice(0, MAX_IMAGES_PER_SECTION)
        .map(idx => extractedImages[idx]);
    }

    const clipMeta = s.clip_start !== undefined
      ? [{ clip_start: s.clip_start, clip_end: s.clip_end }]
      : [];

    const images = sectionImages.length > 0
      ? sectionImages.map(img => ({ url: img.url, page: img.page ?? null, index: img.index }))
      : clipMeta;

    await db.insert(manualSections).values({
      manualId,
      orderIndex:  i,
      title:       s.title,
      contentHtml: buildSectionHtml(s),
      sectionType: s.type ?? "content",
      images:      images as any,
    });
  }

  await db.update(manuals).set({
    status:      "published",
    title:       generated.title,
    language:    generated.language ?? "es",
    generatedAt: new Date(),
    updatedAt:   new Date(),
  }).where(eq(manuals.id, manualId));

  console.log(`[manual] Saved ${generated.sections.length} sections for ${manualId} | images distributed: ${extractedImages.length}`);

  try {
    const { chunks } = await indexManual(manualId);
    console.log(`[manual] RAG indexed ${chunks} sections for ${manualId}`);
  } catch (err: any) {
    console.warn("[manual] RAG indexing failed (manual still published):", err?.message);
  }
}

export async function generateManualFromDocument(
  manualId:        string,
  pdfText:         string,
  sourceTitle:     string,
  targetLanguage:  string = "auto",
  extractedImages: ImageMeta[] = [],
): Promise<void> {
  await db.update(manuals)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(manuals.id, manualId));

  try {
    const langInstruction = targetLanguage !== "auto" && LANG_NAMES[targetLanguage]
      ? `CRITICAL: Write the ENTIRE manual in ${LANG_NAMES[targetLanguage]}. Translate ALL content including section titles, steps, checklists and notes. The "language" field must be "${targetLanguage}".`
      : `Detect language from content and write the entire manual in that language.`;

    const hasImages = extractedImages.length > 0;
    const imageListText = hasImages
      ? `\n\nAVAILABLE IMAGES (${extractedImages.length} total):\n${extractedImages.map(img =>
          `  - Image index ${img.index}: page ${img.page ?? "unknown"}`
        ).join("\n")}\n\nFor each section, add "image_indices": [N, ...] with the indices of images that visually belong to that section based on their page number vs section content. Max 3 images per section. Omit or use [] if none apply.`
      : "";

    const systemPrompt = `You are a professional technical writer specializing in operational manuals.
Create well-structured web manuals that cover ALL topics in the source document.${hasImages ? "\nAssign images to sections where they visually support the content based on page proximity." : ""}
Respond ONLY with valid JSON, no markdown, no preamble.`;

    const prompt = `Analyze the following document and create a comprehensive web manual in JSON format.

DOCUMENT TITLE: ${sourceTitle}
DOCUMENT CONTENT:
${pdfText.slice(0, 55000)}
${imageListText}

${langInstruction}

Return JSON with this exact structure:
{
  "title": "Manual title",
  "language": "es|en|fr|pt",
  "sections": [
    {
      "title": "Section title",
      "type": "intro|steps|checklist|note|warning|content",
      "content": "Main paragraph describing this section",
      "steps": ["Step 1", "Step 2"],
      "checklist": ["Check item 1"],
      "notes": ["Important note"],
      "warning": "Critical safety warning if applicable",
      "image_indices": [0, 2]
    }
  ]
}

Create 6-12 sections covering ALL topics. First section = intro, last = summary/contacts.`;

    const generated = await callClaude(prompt, systemPrompt);
    await saveSections(manualId, generated, extractedImages);
  } catch (err: any) {
    console.error("[manual] document generation error:", err?.message);
    await db.update(manuals).set({ status: "error", updatedAt: new Date() }).where(eq(manuals.id, manualId));
    throw err;
  }
}

export async function generateManualFromVideo(
  manualId:       string,
  transcription:  TranscriptionResult,
  sourceTitle:    string,
  videoDuration:  number,
  targetLanguage: string = "auto",
): Promise<void> {
  await db.update(manuals)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(manuals.id, manualId));

  const effectiveLang = targetLanguage !== "auto" ? targetLanguage : (transcription.language ?? "auto");
  const langInstruction = LANG_NAMES[effectiveLang]
    ? `IMPORTANT: Generate ALL content in ${LANG_NAMES[effectiveLang]}. The "language" field must be "${effectiveLang}".`
    : `Use the detected transcription language throughout.`;

  try {
    const systemPrompt = `You are a senior industrial engineer specialized in operational procedures and SOPs.
Convert video transcriptions into structured, executable SOP manuals.
Only include steps clearly evidenced in the transcription.
Respond ONLY with valid JSON, no markdown, no preamble.`;

    const segmentsText = transcription.segments?.map(s =>
      `[${Math.round(s.start)}s-${Math.round(s.end)}s] ${s.text}`
    ).join("\n") ?? transcription.text;

    const prompt = `Convert the following video transcription into an executable SOP manual.

VIDEO TITLE: ${sourceTitle}
VIDEO DURATION: ${Math.round(videoDuration)}s
DETECTED LANGUAGE: ${transcription.language}
FULL TEXT: ${transcription.text}

TRANSCRIPTION WITH TIMESTAMPS:
${segmentsText.slice(0, 50000)}

${langInstruction}

Return JSON with this exact structure:
{
  "title": "SOP title based on video content",
  "language": "${transcription.language}",
  "sections": [
    {
      "title": "Section title",
      "type": "intro|steps|checklist|note|warning|content",
      "content": "Description of what happens in this part",
      "steps": ["Step 1 (actionable)", "Step 2"],
      "checklist": ["Required item to verify"],
      "notes": ["Tip from video"],
      "warning": "Safety warning if mentioned",
      "clip_start": 0,
      "clip_end": 45,
      "image_indices": []
    }
  ]
}

IMPORTANT:
- clip_start and clip_end are seconds from video start for that section
- Only include steps clearly evidenced in the transcription
- Mark unclear steps with [VERIFY] prefix
- Create 5-10 sections covering the full procedure`;

    const generated = await callClaude(prompt, systemPrompt);
    await saveSections(manualId, generated, []);
  } catch (err: any) {
    console.error("[manual] video generation error:", err?.message);
    await db.update(manuals).set({ status: "error", updatedAt: new Date() }).where(eq(manuals.id, manualId));
    throw err;
  }
}

// Backward compat alias
export const generateManual = generateManualFromDocument;
