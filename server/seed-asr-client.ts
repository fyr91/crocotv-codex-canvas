import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { gunzipSync, gzipSync } from "node:zlib";
import WebSocket, { type RawData } from "ws";

export type SeedAsrConfig = {
  apiKey: string;
  endpoint: string;
  resourceId: string;
  model: "doubao-seed-asr-2.0";
  segmentDurationMs: number;
};

export type SeedAsrPayload = {
  audio_info?: { duration?: number };
  result?: { text?: string; utterances?: unknown[] };
  [key: string]: unknown;
};

export function loadSeedAsrConfig(env: NodeJS.ProcessEnv = process.env): SeedAsrConfig {
  const apiKey = String(env.CODING_PLAN_API_KEY || "").trim();
  if (!apiKey) throw new Error("请在本地 Provider 设置中填写 CODING_PLAN_API_KEY");
  return {
    apiKey,
    endpoint: String(env.CODING_PLAN_ASR_BASE_URL || "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream").trim(),
    resourceId: String(env.CODING_PLAN_ASR_RESOURCE_ID || "volc.seedasr.sauc.duration").trim(),
    model: "doubao-seed-asr-2.0",
    segmentDurationMs: Math.max(100, Math.min(200, Number(env.CODING_PLAN_ASR_SEGMENT_MS) || 200)),
  };
}

export async function transcribeSeedAsr(wavBytes: Uint8Array, config = loadSeedAsrConfig(), timeoutMs = 180_000): Promise<SeedAsrPayload & { logId?: string }> {
  if (!wavBytes.length) throw new Error("Seed-ASR 输入音频为空");
  const requestId = randomUUID();
  const socket = new WebSocket(config.endpoint, {
    headers: {
      "X-Api-Key": config.apiKey,
      "X-Api-Resource-Id": config.resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Connect-Id": requestId,
      "X-Api-Sequence": "-1",
    },
  });
  const queue = messageQueue(socket);
  let logId = "";
  socket.once("upgrade", (response: IncomingMessage) => { logId = String(response.headers["x-tt-logid"] || ""); });
  try {
    await waitForOpen(socket, timeoutMs);
    let sequence = 1;
    socket.send(buildFullClientRequest(sequence));
    const acknowledgement = parseSeedAsrResponse(await queue.next(timeoutMs));
    if (acknowledgement.error) throw acknowledgement.error;

    const segmentSize = 32_000 * config.segmentDurationMs / 1000;
    const segments = splitAudio(Buffer.from(wavBytes), segmentSize);
    const sender = (async () => {
      for (let index = 0; index < segments.length; index += 1) {
        sequence += 1;
        const isLast = index === segments.length - 1;
        socket.send(buildAudioRequest(sequence, segments[index], isLast));
        if (!isLast) await wait(config.segmentDurationMs);
      }
    })();

    let finalPayload: SeedAsrPayload = {};
    while (true) {
      const response = parseSeedAsrResponse(await queue.next(timeoutMs));
      if (response.error) throw response.error;
      if (response.payload) finalPayload = response.payload;
      if (response.isLast) break;
    }
    await sender;
    return { ...finalPayload, ...(logId ? { logId } : {}) };
  } finally {
    queue.dispose();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  }
}

export function buildFullClientRequest(sequence: number) {
  const payload = gzipSync(Buffer.from(JSON.stringify({
    user: { uid: "croco-video-factory" },
    audio: { format: "wav", codec: "raw", rate: 16000, bits: 16, channel: 1 },
    request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: false },
  })));
  return packet([0x11, 0x11, 0x11, 0x00], sequence, payload);
}

export function buildAudioRequest(sequence: number, audio: Uint8Array, isLast: boolean) {
  const payload = gzipSync(audio);
  return packet([0x11, isLast ? 0x23 : 0x21, 0x11, 0x00], isLast ? -Math.abs(sequence) : sequence, payload);
}

export function parseSeedAsrResponse(data: Uint8Array): { isLast: boolean; payload?: SeedAsrPayload; error?: Error } {
  const bytes = Buffer.from(data);
  if (bytes.length < 4) return { isLast: true, error: new Error("Seed-ASR 返回了无效二进制响应") };
  const headerSize = (bytes[0] & 0x0f) * 4;
  const messageType = bytes[1] >> 4;
  const flags = bytes[1] & 0x0f;
  const serialization = bytes[2] >> 4;
  const compression = bytes[2] & 0x0f;
  let offset = headerSize;
  if (flags & 0x01) offset += 4;
  if (flags & 0x04) offset += 4;
  const isLast = Boolean(flags & 0x02);
  if (messageType === 0x0f) {
    const code = readInt32(bytes, offset);
    const length = readUInt32(bytes, offset + 4);
    const message = bytes.subarray(offset + 8, offset + 8 + length).toString("utf8");
    return { isLast: true, error: new Error(`Seed-ASR 请求失败（${code}）：${message.slice(0, 300)}`) };
  }
  if (messageType !== 0x09) return { isLast };
  const length = readUInt32(bytes, offset);
  let payload = bytes.subarray(offset + 4, offset + 4 + length);
  if (compression === 0x01 && payload.length) payload = gunzipSync(payload);
  if (!payload.length) return { isLast };
  if (serialization !== 0x01) return { isLast: true, error: new Error("Seed-ASR 返回了不支持的序列化格式") };
  try { return { isLast, payload: JSON.parse(payload.toString("utf8")) as SeedAsrPayload }; }
  catch { return { isLast: true, error: new Error("Seed-ASR 返回了无效 JSON") }; }
}

function packet(header: number[], sequence: number, payload: Uint8Array) {
  const bytes = Buffer.alloc(12 + payload.length);
  Buffer.from(header).copy(bytes, 0);
  bytes.writeInt32BE(sequence, 4);
  bytes.writeUInt32BE(payload.length, 8);
  Buffer.from(payload).copy(bytes, 12);
  return bytes;
}

function splitAudio(audio: Buffer, segmentSize: number) {
  const segments: Buffer[] = [];
  for (let offset = 0; offset < audio.length; offset += segmentSize) segments.push(audio.subarray(offset, Math.min(audio.length, offset + segmentSize)));
  return segments;
}

function readInt32(bytes: Buffer, offset: number) { return bytes.length >= offset + 4 ? bytes.readInt32BE(offset) : 0; }
function readUInt32(bytes: Buffer, offset: number) { return bytes.length >= offset + 4 ? bytes.readUInt32BE(offset) : 0; }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function waitForOpen(socket: WebSocket, timeoutMs: number) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Seed-ASR WebSocket 连接超时")), timeoutMs);
    const finish = (error?: Error) => { clearTimeout(timer); socket.off("open", onOpen); socket.off("error", onError); error ? reject(error) : resolve(); };
    const onOpen = () => finish();
    const onError = (error: Error) => finish(error);
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

function messageQueue(socket: WebSocket) {
  const messages: Buffer[] = [];
  const waiters: Array<{ resolve: (value: Buffer) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];
  const onMessage = (data: RawData) => {
    const value = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    const waiter = waiters.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(value); } else messages.push(value);
  };
  const onError = (error: Error) => rejectAll(error);
  const onClose = () => rejectAll(new Error("Seed-ASR WebSocket 提前关闭"));
  const rejectAll = (error: Error) => { while (waiters.length) { const waiter = waiters.shift()!; clearTimeout(waiter.timer); waiter.reject(error); } };
  socket.on("message", onMessage);
  socket.on("error", onError);
  socket.on("close", onClose);
  return {
    next(timeoutMs: number) {
      const value = messages.shift();
      if (value) return Promise.resolve(value);
      return new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => { const index = waiters.findIndex((item) => item.resolve === resolve); if (index >= 0) waiters.splice(index, 1); reject(new Error("Seed-ASR 等待识别结果超时")); }, timeoutMs);
        waiters.push({ resolve, reject, timer });
      });
    },
    dispose() { socket.off("message", onMessage); socket.off("error", onError); socket.off("close", onClose); rejectAll(new Error("Seed-ASR 请求已结束")); },
  };
}
