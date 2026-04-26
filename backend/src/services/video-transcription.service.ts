import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

export interface TranscriptionResult {
  text:      string;
  language:  string;
  duration:  number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export async function transcribeVideo(
  videoBuffer: Buffer,
  filename:    string,
): Promise<TranscriptionResult> {
  const tmpDir  = os.tmpdir();
  const tmpFile = path.join(tmpDir, `staffbot-video-${crypto.randomUUID()}${path.extname(filename)}`);

  try {
    fs.writeFileSync(tmpFile, videoBuffer);

    const stats = fs.statSync(tmpFile);
    if (stats.size > WHISPER_MAX_BYTES) {
      throw new Error(
        `Video file too large for transcription (${Math.round(stats.size / 1024 / 1024)}MB). ` +
        `Maximum is 24MB. Please compress the video first.`
      );
    }

    const fileStream = fs.createReadStream(tmpFile) as unknown as File;

    const transcription = await getClient().audio.transcriptions.create({
      file:                    fileStream,
      model:                   "whisper-1",
      response_format:         "verbose_json",
      timestamp_granularities: ["segment"],
    });

    return {
      text:     transcription.text,
      language: (transcription as any).language ?? "es",
      duration: (transcription as any).duration ?? 0,
      segments: (transcription as any).segments?.map((s: any) => ({
        start: s.start,
        end:   s.end,
        text:  s.text.trim(),
      })) ?? [],
    };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
