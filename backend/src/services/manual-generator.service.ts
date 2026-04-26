import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/index.js";
import { manuals, manualSections } from "../db/schema.js";
import { eq } from "drizzle-orm";

interface ManualSection {
  title:      string;
  type:       "intro" | "steps" | "note" | "checklist" | "content";
  content:    string;
  steps?:     string[];
  notes?:     string[];
  checklist?: string[];
}

interface GeneratedManual {
  title:    string;
  language: string;
  sections: ManualSection[];
}

function buildSectionHtml(section: ManualSection): string {
  let html = `<p class="sb-section-body">${section.content}</p>`;

  if (section.steps?.length) {
    html += `<ol class="sb-steps">${section.steps.map(s =>
      `<li class="sb-step">${s}</li>`
    ).join("")}</ol>`;
  }

  if (section.checklist?.length) {
    html += `<ul class="sb-checklist">${section.checklist.map(s =>
      `<li class="sb-check"><span class="sb-check-box"></span>${s}</li>`
    ).join("")}</ul>`;
  }

  if (section.notes?.length) {
    html += section.notes.map(n =>
      `<div class="sb-note"><span class="sb-note-label">Nota</span>${n}</div>`
    ).join("");
  }

  return html;
}

export async function generateManual(
  manualId:    string,
  pdfText:     string,
  sourceTitle: string,
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await db.update(manuals)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(manuals.id, manualId));

  try {
    const prompt = `You are a professional technical writer. Analyze the following document and create a well-structured web manual in JSON format.

DOCUMENT TITLE: ${sourceTitle}
DOCUMENT CONTENT:
${pdfText.slice(0, 60000)}

Create a comprehensive, well-organized manual with the following JSON structure:
{
  "title": "Manual title (concise, professional)",
  "language": "es|en|fr|pt (detected from content)",
  "sections": [
    {
      "title": "Section title",
      "type": "intro|steps|checklist|note|content",
      "content": "Main paragraph text for this section. Be detailed and clear.",
      "steps": ["Step 1 description", "Step 2 description"],
      "checklist": ["Item to check 1", "Item to check 2"],
      "notes": ["Important note or warning"]
    }
  ]
}

RULES:
- Create 6-12 sections minimum, covering ALL topics in the document
- First section must be type "intro" — welcome/overview
- Last section must be contacts or summary
- type "steps" = numbered process with steps array
- type "checklist" = items to verify/complete with checklist array
- type "note" = important warnings or reminders
- type "content" = regular informational text
- Write content in the SAME LANGUAGE as the document
- Be thorough — employees will use this as their primary reference
- Respond with ONLY the JSON object, no markdown, no preamble`;

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 8000,
      messages:   [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    const cleaned  = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const generated: GeneratedManual = JSON.parse(cleaned);

    await db.delete(manualSections).where(eq(manualSections.manualId, manualId));

    for (let i = 0; i < generated.sections.length; i++) {
      const s = generated.sections[i];
      await db.insert(manualSections).values({
        manualId:    manualId,
        orderIndex:  i,
        title:       s.title,
        contentHtml: buildSectionHtml(s),
        sectionType: s.type ?? "content",
        images:      [],
      });
    }

    await db.update(manuals).set({
      status:      "published",
      title:       generated.title ?? sourceTitle,
      language:    generated.language ?? "es",
      generatedAt: new Date(),
      updatedAt:   new Date(),
    }).where(eq(manuals.id, manualId));

    console.log(`[manual] Generated ${generated.sections.length} sections for ${manualId}`);
  } catch (err: any) {
    console.error("[manual] generation error:", err?.message);
    await db.update(manuals).set({
      status:    "error",
      updatedAt: new Date(),
    }).where(eq(manuals.id, manualId));
    throw err;
  }
}
