import { randomUUID } from "node:crypto";
import { Mp3Encoder } from "@breezystack/lamejs";
import { addResource, fileSize, writeGenerated } from "./storage";

const deepSeekV4FlashModel = "deepseek-v4-flash-ga-260731";

const systemPrompt = `你负责把一段中文正文按局部表达方式拆分为可分别合成语音的连续片段。用户消息是一个 JSON 对象，只包含 currentText 与 voiceDirection。

你的任务：
1. 结合 currentText 的语义、节奏和 voiceDirection 判断局部语气；voiceDirection 为空时完全根据 currentText 判断，非空时只作为分析参考，不能作为整段输出字段。
2. 只在情绪、语气、节奏、音量或说话方式确实发生变化时拆分，不要机械地逐句拆分；没有明显变化时返回一个覆盖全文的片段。
3. 每个 text 必须是 currentText 中按原顺序出现的连续原文。不得增加、删除、替换、重排或清理任何字词、数字、标点、空白、方括号或换行。
4. 所有 text 按顺序直接拼接后，必须逐字符还原 currentText。
5. 每个 contextTexts 必须包含一至三条简洁、自然、可直接交给语音模型的中文表达指令，例如“用克制、略带疑惑的语气表达”。不要使用方括号标记，不要复制整段 voiceDirection。
6. contextTexts 必须与当前 text 对应，避免互相冲突、无关或过度夸张的指令；每个片段的全部指令合计不得超过 260 个字符。
7. segments 必须包含一至二十个片段，每个片段只能包含 text 与 contextTexts。

你必须且只能返回一个 JSON 对象，只包含 segments；每个 segment 只包含 text 与 contextTexts。不要输出 Markdown、解释或额外字段。`;

type Segment = { text: string; contextTexts: string[] };
export type SpeechGenerationProgress = {
  stage: "tone" | "tone-ready" | "synthesis" | "saving" | "error";
  label: string;
  toneModel: string;
  segments?: Segment[];
  current?: number;
  total?: number;
  failedStage?: "tone" | "synthesis" | "saving";
  error?: string;
};

export async function generateSpeech(input: { content: string; voiceId: string; direction?: string }, onProgress?: (progress: SpeechGenerationProgress) => void | Promise<void>) {
  if (!input.content.trim()) throw new Error("语音正文不能为空");
  if (!input.voiceId.trim()) throw new Error("请从角色目录选择一个已有角色");
  const configuredToneModel = process.env.TTS_TONE_MODEL || deepSeekV4FlashModel;
  const toneModel = configuredToneModel === "deepseek-v4-flash-260425" ? deepSeekV4FlashModel : configuredToneModel;
  let failedStage: "tone" | "synthesis" | "saving" = "tone";
  try {
    await onProgress?.({ stage: "tone", label: "DeepSeek 正在优化语气", toneModel });
    const segments = await optimizeTone(input.content, input.direction || "", toneModel);
    await onProgress?.({ stage: "tone-ready", label: "语气优化完成", toneModel, segments });
    failedStage = "synthesis";
    const sectionId = randomUUID();
    const chunks: Uint8Array[] = [];
    for (let index = 0; index < segments.length; index++) {
      await onProgress?.({ stage: "synthesis", label: `Seed-TTS 正在生成语音（${index + 1}/${segments.length}）`, toneModel, current: index + 1, total: segments.length });
      chunks.push(await requestDoubaoPcm(segments[index], input.voiceId, sectionId));
    }
    failedStage = "saving";
    await onProgress?.({ stage: "saving", label: "正在保存语音结果", toneModel, total: segments.length });
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const mp3 = encodeMp3(new Uint8Array(bytes));
    const stored = await writeGenerated("speech", "mp3", mp3);
    return addResource({ id: stored.id, name: `语音-${new Date().toLocaleString("zh-CN")}.mp3`, type: "audio", mimeType: "audio/mpeg", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "speech", metadata: { voiceId: input.voiceId, segments: segments.length, model: "seed-tts-2.0-expressive", toneModel, speechRate: 25 } });
  } catch (error) {
    try {
      await onProgress?.({ stage: "error", label: failedStage === "tone" ? "语气优化失败" : "语音生成失败", toneModel, failedStage, error: error instanceof Error ? error.message : "语音生成失败" });
    } catch {
      // Preserve the provider error when a progress target was removed mid-generation.
    }
    throw error;
  }
}

async function optimizeTone(content: string, direction: string, model: string) {
  const baseUrl = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const apiKey = required("ARK_API_KEY");
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ currentText: content, voiceDirection: direction, ...(feedback ? { validationFeedback: feedback } : {}) }) }], thinking: { type: "enabled" }, response_format: { type: "json_object" }, stream: false }), signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`豆包语气优化失败（${response.status}）`);
    const payload = await response.json() as any;
    try { return parseSegments(payload?.choices?.[0]?.message?.content, content); }
    catch (error) { if (attempt === 3) throw error; feedback = `上一次输出未通过校验：${(error as Error).message}。请严格修正。`; }
  }
  throw new Error("语气优化失败");
}

function parseSegments(raw: unknown, original: string): Segment[] {
  let payload: any;
  try { payload = JSON.parse(String(raw || "")); } catch { throw new Error("豆包返回了无效 JSON"); }
  if (!payload || Object.keys(payload).join() !== "segments" || !Array.isArray(payload.segments) || payload.segments.length < 1 || payload.segments.length > 20) throw new Error("豆包语气分段结构不合法");
  const segments = payload.segments.map((item: any, index: number) => {
    const rawContexts = item?.contextTexts ?? item?.context_texts;
    const contextTexts = typeof rawContexts === "string" ? [rawContexts] : rawContexts;
    if (typeof item?.text !== "string" || !Array.isArray(contextTexts) || contextTexts.length < 1 || contextTexts.length > 3 || contextTexts.some((value: unknown) => typeof value !== "string" || !value.trim())) throw new Error(`第 ${index + 1} 个语气片段不合法`);
    if (Array.from(contextTexts.join("")).length > 260) throw new Error(`第 ${index + 1} 个语气指令过长`);
    return { text: item.text, contextTexts };
  });
  if (segments.map((item: Segment) => item.text).join("") !== original) throw new Error("语气优化改变了原文");
  return segments;
}

async function requestDoubaoPcm(segment: Segment, voiceId: string, sectionId: string) {
  const response = await fetch(`${(process.env.DOUBAO_TTS_BASE_URL || "https://openspeech.bytedance.com/api/v3").replace(/\/$/, "")}/tts/unidirectional`, {
    method: "POST", headers: { "X-Api-Key": required("DOUBAO_TTS_API_KEY"), "X-Api-Resource-Id": required("DOUBAO_TTS_RESOURCE_ID"), "X-Api-Request-Id": randomUUID(), "Content-Type": "application/json", Accept: "text/event-stream, application/octet-stream, application/json" },
    body: JSON.stringify({ user: { uid: sectionId }, namespace: "BidirectionalTTS", req_params: { text: segment.text, model: "seed-tts-2.0-expressive", speaker: voiceId, audio_params: { format: "pcm", sample_rate: 24000, bit_rate: 128000, speech_rate: 25, loudness_rate: 0 }, additions: JSON.stringify({ context_texts: segment.contextTexts, tone_fidelity: true, section_id: sectionId }) } }), signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`豆包语音生成失败（${response.status}）`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("audio/") || contentType.includes("octet-stream")) return new Uint8Array(await response.arrayBuffer());
  const chunks: Buffer[] = [];
  for (const item of parseJsonObjects(await response.text())) {
    if (item.code && Number(item.code) !== 20000000) throw new Error(item.message || `豆包语音生成失败（${item.code}）`);
    const audio = typeof item.data === "string" ? item.data : item.audio || item.data?.audio || item.data?.audio_data || item.data?.audio_base64 || item.audio_data;
    if (typeof audio === "string" && audio) chunks.push(Buffer.from(audio, "base64"));
  }
  if (!chunks.length) throw new Error("豆包语音没有返回音频数据");
  return new Uint8Array(Buffer.concat(chunks));
}

function encodeMp3(bytes: Uint8Array) {
  if (!bytes.length || bytes.length % 2) throw new Error("豆包语音返回了无效 PCM 数据");
  const samples = new Int16Array(bytes.length / 2), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true);
  const encoder = new Mp3Encoder(1, 24000, 128), chunks: Buffer[] = [];
  for (let offset = 0; offset < samples.length; offset += 1152) { const chunk = encoder.encodeBuffer(samples.subarray(offset, offset + 1152)); if (chunk.length) chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)); }
  const final = encoder.flush(); if (final.length) chunks.push(Buffer.from(final.buffer, final.byteOffset, final.byteLength));
  return new Uint8Array(Buffer.concat(chunks));
}

function parseJsonObjects(source: string) {
  const items: any[] = []; let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < source.length; index++) { const char = source[index]; if (start < 0) { if (char === "{") { start = index; depth = 1; } continue; } if (escaped) { escaped = false; continue; } if (quoted && char === "\\") { escaped = true; continue; } if (char === '"') { quoted = !quoted; continue; } if (!quoted && char === "{") depth++; if (!quoted && char === "}" && --depth === 0) { items.push(JSON.parse(source.slice(start, index + 1))); start = -1; } }
  return items;
}

function required(name: string) { const value = String(process.env[name] || "").trim(); if (!value) throw new Error(`请在 .env 中填写 ${name}`); return value; }
