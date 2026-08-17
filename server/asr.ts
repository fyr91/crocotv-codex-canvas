import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dataDir, resourceById, safeResourcePath } from "./storage";
import { loadSeedAsrConfig, transcribeSeedAsr } from "./seed-asr-client";

export type AsrVerification = {
  provider: "coding-plan-seed-asr-2.0";
  transcript: string;
  expectedText: string;
  normalizedTranscript: string;
  normalizedExpectedText: string;
  similarity: number;
  threshold: number;
  passed: boolean;
  durationMs?: number;
};

export async function verifyResourceSpeech(resourceId: string, expectedText: string, threshold = 0.88): Promise<AsrVerification> {
  const resource = await resourceById(resourceId);
  if (!resource) throw new Error(`ASR 资源不存在：${resourceId}`);
  if (!resource.mimeType.startsWith("audio/") && !resource.mimeType.startsWith("video/")) throw new Error("火山 ASR 只接受音频或视频节点");
  const expected = String(expectedText || "").trim();
  if (!expected) throw new Error("ASR 验收文案不能为空");
  const boundedThreshold = Math.max(0.5, Math.min(1, Number(threshold) || 0.88));
  const source = safeResourcePath(resource.fileName);
  const runtimeDir = path.join(dataDir, "runtime", "asr");
  await mkdir(runtimeDir, { recursive: true });
  const converted = path.join(runtimeDir, `${randomUUID()}.wav`);
  try {
    await extractSpeechAudio(source, converted);
    const payload = await transcribeSeedAsr(await readFile(converted), loadSeedAsrConfig());
    const transcript = String(payload?.result?.text || payload?.text || "").trim();
    if (!transcript) throw new Error("火山 ASR 没有返回识别文本");
    const normalizedTranscript = normalizeSpeechText(transcript);
    const normalizedExpectedText = normalizeSpeechText(expected);
    const similarity = textSimilarity(normalizedTranscript, normalizedExpectedText);
    return {
      provider: "coding-plan-seed-asr-2.0",
      transcript,
      expectedText: expected,
      normalizedTranscript,
      normalizedExpectedText,
      similarity,
      threshold: boundedThreshold,
      passed: similarity >= boundedThreshold || normalizedTranscript.includes(normalizedExpectedText) || normalizedExpectedText.includes(normalizedTranscript),
      ...(Number(payload.audio_info?.duration) > 0 ? { durationMs: Number(payload.audio_info?.duration) } : {}),
    };
  } finally {
    await unlink(converted).catch(() => undefined);
  }
}

function extractSpeechAudio(source: string, target: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", target], { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => { errorText = `${errorText}${String(chunk)}`.slice(-2000); });
    child.once("error", (error) => reject(new Error(`无法启动 ffmpeg：${error.message}`)));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`音轨提取失败：${errorText.trim() || `ffmpeg code ${code}`}`)));
  });
}

function normalizeSpeechText(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function textSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return Math.max(0, 1 - previous[right.length] / Math.max(left.length, right.length));
}
