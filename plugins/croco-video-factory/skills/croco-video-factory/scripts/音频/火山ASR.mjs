#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

export function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];
        if (!token.startsWith("--")) continue;
        const key = token.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) args[key] = true;
        else { args[key] = value; index++; }
    }
    return args;
}

export function parseEnv(text) {
    const values = {};
    for (const rawLine of String(text || "").split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        values[key] = value;
    }
    return values;
}

export async function loadAsrConfig({ envPath = process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env"), env = process.env } = {}) {
    let fileEnv = {};
    try { fileEnv = parseEnv(await readFile(envPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const value = (name) => String(env[name] || fileEnv[name] || "").trim();
    const apiKey = value("CODING_PLAN_API_KEY");
    if (!apiKey) throw new Error("缺少火山 Coding Plan API Key：请在本地 Provider 设置中填写 CODING_PLAN_API_KEY。");
    return {
        apiKey,
        endpoint: value("CODING_PLAN_ASR_BASE_URL") || "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream",
        resourceId: value("CODING_PLAN_ASR_RESOURCE_ID") || "volc.seedasr.sauc.duration",
        model: "doubao-seed-asr-2.0",
        segmentDurationMs: Math.max(100, Math.min(200, Number(value("CODING_PLAN_ASR_SEGMENT_MS")) || 200)),
    };
}

export async function transcribeAudio({ inputPath, outputPath = null, config = null, envPath, timeoutMs = 180_000 } = {}) {
    if (!inputPath) throw new Error("缺少 ASR 输入音频路径");
    const resolvedInput = path.resolve(String(inputPath));
    if (path.extname(resolvedInput).toLowerCase() !== ".wav") throw new Error("Seed-ASR 2.0 验收输入必须是 16kHz 单声道 PCM WAV");
    const runtime = config || await loadAsrConfig({ envPath });
    const audio = await readFile(resolvedInput);
    if (!audio.length) throw new Error("Seed-ASR 输入音频为空");
    const payload = await recognizeWav(audio, runtime, Number(timeoutMs));
    const result = {
        provider: "coding-plan",
        engine: runtime.model,
        resourceId: runtime.resourceId,
        requestId: payload.requestId,
        logId: payload.logId || null,
        input: resolvedInput,
        durationMs: payload.audio_info?.duration ?? null,
        text: payload.result?.text ?? "",
        utterances: payload.result?.utterances ?? [],
        response: payload,
    };
    if (outputPath) {
        const resolvedOutput = path.resolve(String(outputPath));
        await mkdir(path.dirname(resolvedOutput), { recursive: true });
        await writeFile(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
}

async function recognizeWav(audio, config, timeoutMs) {
    const { default: WebSocket } = await import("ws");
    const requestId = randomUUID();
    const socket = new WebSocket(config.endpoint, { headers: {
        "X-Api-Key": config.apiKey,
        "X-Api-Resource-Id": config.resourceId,
        "X-Api-Request-Id": requestId,
        "X-Api-Connect-Id": requestId,
        "X-Api-Sequence": "-1",
    } });
    const queue = createMessageQueue(socket);
    let logId = "";
    socket.once("upgrade", (response) => { logId = String(response.headers["x-tt-logid"] || ""); });
    try {
        await waitForOpen(socket, timeoutMs, WebSocket);
        let sequence = 1;
        socket.send(buildFullClientRequest(sequence));
        const acknowledgement = parseAsrResponse(await queue.next(timeoutMs));
        if (acknowledgement.error) throw acknowledgement.error;
        const segmentSize = 32_000 * config.segmentDurationMs / 1000;
        const segments = splitAudio(audio, segmentSize);
        const sender = (async () => {
            for (let index = 0; index < segments.length; index++) {
                sequence += 1;
                const isLast = index === segments.length - 1;
                socket.send(buildAudioRequest(sequence, segments[index], isLast));
                if (!isLast) await wait(config.segmentDurationMs);
            }
        })();
        let finalPayload = {};
        while (true) {
            const response = parseAsrResponse(await queue.next(timeoutMs));
            if (response.error) throw response.error;
            if (response.payload) finalPayload = response.payload;
            if (response.isLast) break;
        }
        await sender;
        return { ...finalPayload, requestId, ...(logId ? { logId } : {}) };
    } finally {
        queue.dispose();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
}

export function buildFullClientRequest(sequence) {
    const payload = gzipSync(Buffer.from(JSON.stringify({
        user: { uid: "croco-video-factory" },
        audio: { format: "wav", codec: "raw", rate: 16000, bits: 16, channel: 1 },
        request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: false },
    })));
    return packet([0x11, 0x11, 0x11, 0x00], sequence, payload);
}

export function buildAudioRequest(sequence, audio, isLast) {
    const payload = gzipSync(audio);
    return packet([0x11, isLast ? 0x23 : 0x21, 0x11, 0x00], isLast ? -Math.abs(sequence) : sequence, payload);
}

export function parseAsrResponse(data) {
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
        const code = bytes.length >= offset + 4 ? bytes.readInt32BE(offset) : 0;
        const length = bytes.length >= offset + 8 ? bytes.readUInt32BE(offset + 4) : 0;
        const message = bytes.subarray(offset + 8, offset + 8 + length).toString("utf8");
        return { isLast: true, error: new Error(`Seed-ASR 请求失败（${code}）：${message.slice(0, 300)}`) };
    }
    if (messageType !== 0x09) return { isLast };
    const length = bytes.length >= offset + 4 ? bytes.readUInt32BE(offset) : 0;
    let payload = bytes.subarray(offset + 4, offset + 4 + length);
    if (compression === 0x01 && payload.length) payload = gunzipSync(payload);
    if (!payload.length) return { isLast };
    if (serialization !== 0x01) return { isLast: true, error: new Error("Seed-ASR 返回了不支持的序列化格式") };
    try { return { isLast, payload: JSON.parse(payload.toString("utf8")) }; }
    catch { return { isLast: true, error: new Error("Seed-ASR 返回了无效 JSON") }; }
}

function packet(header, sequence, payload) {
    const bytes = Buffer.alloc(12 + payload.length);
    Buffer.from(header).copy(bytes, 0);
    bytes.writeInt32BE(sequence, 4);
    bytes.writeUInt32BE(payload.length, 8);
    Buffer.from(payload).copy(bytes, 12);
    return bytes;
}

function splitAudio(audio, segmentSize) {
    const segments = [];
    for (let offset = 0; offset < audio.length; offset += segmentSize) segments.push(audio.subarray(offset, Math.min(audio.length, offset + segmentSize)));
    return segments;
}

function createMessageQueue(socket) {
    const messages = [], waiters = [];
    const rejectAll = (error) => { while (waiters.length) { const waiter = waiters.shift(); clearTimeout(waiter.timer); waiter.reject(error); } };
    const onMessage = (data) => { const value = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data); const waiter = waiters.shift(); if (waiter) { clearTimeout(waiter.timer); waiter.resolve(value); } else messages.push(value); };
    const onError = (error) => rejectAll(error);
    const onClose = () => rejectAll(new Error("Seed-ASR WebSocket 提前关闭"));
    socket.on("message", onMessage); socket.on("error", onError); socket.on("close", onClose);
    return {
        next(timeoutMs) { const value = messages.shift(); if (value) return Promise.resolve(value); return new Promise((resolve, reject) => { const timer = setTimeout(() => { const index = waiters.findIndex((item) => item.resolve === resolve); if (index >= 0) waiters.splice(index, 1); reject(new Error("Seed-ASR 等待识别结果超时")); }, timeoutMs); waiters.push({ resolve, reject, timer }); }); },
        dispose() { socket.off("message", onMessage); socket.off("error", onError); socket.off("close", onClose); rejectAll(new Error("Seed-ASR 请求已结束")); },
    };
}

function waitForOpen(socket, timeoutMs, WebSocket) {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = (error) => { clearTimeout(timer); socket.off("open", onOpen); socket.off("error", onError); error ? reject(error) : resolve(); };
        const onOpen = () => finish();
        const onError = (error) => finish(error);
        const timer = setTimeout(() => finish(new Error("Seed-ASR WebSocket 连接超时")), timeoutMs);
        socket.once("open", onOpen); socket.once("error", onError);
    });
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isExecutable() { return Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)); }

if (isExecutable()) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (!args.input) throw new Error("用法：node 火山ASR.mjs --input <16kHz WAV> [--output <JSON>] [--env <.env>]");
        const result = await transcribeAudio({ inputPath: args.input, outputPath: args.output || null, envPath: path.resolve(String(args.env || path.join(process.cwd(), ".codex", ".env"))), timeoutMs: Number(args.timeout || 180_000) });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error?.stack || error}\n`);
        process.exitCode = 1;
    }
}
