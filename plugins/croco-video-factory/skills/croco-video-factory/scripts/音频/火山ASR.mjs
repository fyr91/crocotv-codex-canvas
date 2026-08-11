#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
    const apiKey = value("VOLCENGINE_ASR_API_KEY") || value("DOUBAO_ASR_API_KEY") || value("DOUBAO_TTS_API_KEY");
    if (!apiKey) throw new Error("缺少火山 ASR API Key：请设置 VOLCENGINE_ASR_API_KEY 或 DOUBAO_ASR_API_KEY；已配置同账号语音权限时可复用 DOUBAO_TTS_API_KEY。");
    return {
        apiKey,
        endpoint: value("VOLCENGINE_ASR_BASE_URL") || value("DOUBAO_ASR_BASE_URL") || "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
        resourceId: value("VOLCENGINE_ASR_RESOURCE_ID") || value("DOUBAO_ASR_RESOURCE_ID") || "volc.bigasr.auc_turbo",
    };
}

export function detectAudioFormat(inputPath) {
    const extension = path.extname(inputPath).slice(1).toLowerCase();
    if (extension === "wave") return "wav";
    if (["wav", "mp3", "ogg", "opus"].includes(extension)) return extension;
    throw new Error(`火山录音文件极速版不支持该输入格式：${extension || "未知"}`);
}

export async function transcribeAudio({ inputPath, outputPath = null, config = null, envPath, timeoutMs = 120_000, fetcher = fetch } = {}) {
    const resolvedInput = path.resolve(String(inputPath || ""));
    if (!inputPath) throw new Error("缺少 ASR 输入音频路径");
    const runtime = config || await loadAsrConfig({ envPath });
    const requestId = randomUUID();
    const audio = await readFile(resolvedInput);
    if (!audio.length) throw new Error("火山 ASR 输入音频为空");
    const response = await fetcher(runtime.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": runtime.apiKey,
            "X-Api-Resource-Id": runtime.resourceId,
            "X-Api-Request-Id": requestId,
            "X-Api-Sequence": "-1",
        },
        body: JSON.stringify({
            user: { uid: "croco-video-factory" },
            audio: { data: audio.toString("base64"), format: detectAudioFormat(resolvedInput) },
            request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, show_utterances: true },
        }),
        signal: AbortSignal.timeout(Number(timeoutMs)),
    });
    const rawText = await response.text();
    let payload;
    try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }
    const statusCode = response.headers.get("x-api-status-code");
    const message = response.headers.get("x-api-message");
    const logId = response.headers.get("x-tt-logid");
    const normalSilence = response.ok && statusCode === "20000003" && /normal silence audio/iu.test(String(message || ""));
    if (!response.ok || (statusCode && statusCode !== "20000000" && !normalSilence)) {
        throw new Error(`火山 ASR 请求失败：HTTP ${response.status}，status=${statusCode || "unknown"}，message=${message || "unknown"}，logid=${logId || "unknown"}`);
    }
    const result = {
        provider: "volcengine",
        engine: runtime.resourceId,
        requestId,
        logId,
        statusCode,
        message,
        normalSilence,
        input: resolvedInput,
        durationMs: payload?.audio_info?.duration ?? null,
        text: normalSilence ? "" : payload?.result?.text ?? "",
        utterances: normalSilence ? [] : payload?.result?.utterances ?? [],
        response: payload,
    };
    if (outputPath) {
        const resolvedOutput = path.resolve(String(outputPath));
        await mkdir(path.dirname(resolvedOutput), { recursive: true });
        await writeFile(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
}

function isExecutable() {
    if (!process.argv[1]) return false;
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutable()) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (!args.input) throw new Error("用法：node 火山ASR.mjs --input <音频文件> [--output <JSON>] [--env <.env>]");
        const result = await transcribeAudio({
            inputPath: args.input,
            outputPath: args.output || null,
            envPath: path.resolve(String(args.env || path.join(process.cwd(), ".codex", ".env"))),
            timeoutMs: Number(args.timeout || 120_000),
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error?.stack || error}\n`);
        process.exitCode = 1;
    }
}
