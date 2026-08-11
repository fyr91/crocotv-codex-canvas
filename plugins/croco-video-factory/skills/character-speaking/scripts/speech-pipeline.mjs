import { Mp3Encoder } from "@breezystack/lamejs";
import { access, link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const flags = new Set(["--voice-id", "--content", "--direction", "--output"]);
const toneResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["segments"],
    properties: {
        segments: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "contextTexts"],
                properties: {
                    text: { type: "string", minLength: 1 },
                    contextTexts: {
                        type: "array",
                        minItems: 1,
                        maxItems: 3,
                        items: { type: "string", minLength: 1 },
                    },
                },
            },
        },
    },
};

export function parseCliArgs(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (!flags.has(flag)) throw new Error(`未知参数：${flag || "空参数"}`);
        if (value === undefined || value.startsWith("--")) throw new Error(`${flag} 缺少参数值`);
        values[flag] = value;
    }
    const voiceId = String(values["--voice-id"] || "").trim();
    const content = String(values["--content"] || "");
    if (!voiceId) throw new Error("--voice-id 必填");
    if (!content.trim()) throw new Error("--content 必填");
    return {
        voiceId,
        content,
        direction: String(values["--direction"] || "").trim(),
        output: values["--output"],
    };
}

export async function resolveOutputPath(rootDir, requested) {
    const target = requested ? path.resolve(rootDir, requested) : path.join(rootDir, "output");
    if (target.toLowerCase().endsWith(".mp3")) {
        await mkdir(path.dirname(target), { recursive: true });
        if (await exists(target)) throw new Error(`输出文件已存在：${target}`);
        return target;
    }
    await mkdir(target, { recursive: true });
    const date = new Date();
    const stamp = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
        "-",
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
    ].join("");
    for (let suffix = 1; ; suffix += 1) {
        const candidate = path.join(target, `speech-${stamp}${suffix === 1 ? "" : `-${suffix}`}.mp3`);
        if (!await exists(candidate)) return candidate;
    }
}

async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export function parseToneSegments(raw, original) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("DeepSeek 返回了无效 JSON");
    }
    if (!isRecord(parsed) || !hasExactKeys(parsed, ["segments"])) throw new Error("DeepSeek 返回了额外字段或缺少 segments");
    if (!Array.isArray(parsed.segments) || parsed.segments.length < 1 || parsed.segments.length > 20) {
        throw new Error("DeepSeek segments 数量必须为 1–20");
    }
    const segments = parsed.segments.map((item, index) => {
        if (!isRecord(item) || !hasExactKeys(item, ["text", "contextTexts"])) {
            throw new Error(`DeepSeek 第 ${index + 1} 个片段包含额外字段或缺少字段`);
        }
        if (typeof item.text !== "string" || !item.text) throw new Error(`DeepSeek 第 ${index + 1} 个片段 text 不能为空`);
        if (!Array.isArray(item.contextTexts) || item.contextTexts.length < 1 || item.contextTexts.length > 3) {
            throw new Error(`DeepSeek 第 ${index + 1} 个片段 contextTexts 数量必须为 1–3`);
        }
        const contextTexts = item.contextTexts.map((value) => typeof value === "string" ? value.trim() : "");
        if (contextTexts.some((value) => !value)) throw new Error(`DeepSeek 第 ${index + 1} 个片段语气指令不能为空`);
        if (Array.from(contextTexts.join("")).length > 260) throw new Error(`DeepSeek 第 ${index + 1} 个片段语气指令不能超过 260 个字符`);
        return { text: item.text, contextTexts };
    });
    if (segments.map((segment) => segment.text).join("") !== original) throw new Error("DeepSeek 语气优化结果改变了原文");
    return segments;
}

export async function optimizeTone(input, dependencies = {}) {
    const fetcher = dependencies.fetcher || fetch;
    let validationFeedback;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const userData = { currentText: input.content, voiceDirection: input.direction };
        if (validationFeedback) userData.validationFeedback = validationFeedback;
        const response = await fetcher(joinUrl(input.config.arkBaseUrl, "/chat/completions"), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${input.config.arkApiKey}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                model: input.config.arkModel,
                messages: [
                    { role: "system", content: input.systemPrompt },
                    { role: "user", content: JSON.stringify(userData) },
                ],
                response_format: { type: "json_object" },
                stream: false,
            }),
            signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) throw new Error(await responseError(response, `DeepSeek 语气优化失败（${response.status}）`));
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content) throw new Error("DeepSeek 没有返回语气优化结果");
        try {
            return parseToneSegments(content, input.content);
        } catch (error) {
            if (attempt === 3) throw error;
            validationFeedback = `上一次输出未通过校验：${error.message}。请严格按 System Prompt 修正，只返回合规 JSON。`;
        }
    }
}

function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function joinUrl(baseUrl, suffix) {
    return `${String(baseUrl || "").replace(/\/+$/, "")}${suffix}`;
}

async function responseError(response, fallback) {
    try {
        const text = (await response.text()).trim();
        if (!text) return fallback;
        try {
            const payload = JSON.parse(text);
            return payload?.error?.message || payload?.header?.message || payload?.message || fallback;
        } catch {
            return text.replace(/\s+/g, " ").slice(0, 500);
        }
    } catch {
        return fallback;
    }
}

export function configFromEnv(env = process.env) {
    const config = {
        arkApiKey: String(env.ARK_API_KEY || "").trim(),
        arkModel: String(env.TTS_TONE_MODEL || "deepseek-v4-flash-260425").trim(),
        arkBaseUrl: String(env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").trim(),
        doubaoApiKey: String(env.DOUBAO_TTS_API_KEY || "").trim(),
        doubaoResourceId: String(env.DOUBAO_TTS_RESOURCE_ID || "").trim(),
        doubaoBaseUrl: String(env.DOUBAO_TTS_BASE_URL || "https://openspeech.bytedance.com/api/v3").trim(),
    };
    const missing = [
        ["ARK_API_KEY", config.arkApiKey],
        ["TTS_TONE_MODEL", config.arkModel],
        ["ARK_BASE_URL", config.arkBaseUrl],
        ["DOUBAO_TTS_API_KEY", config.doubaoApiKey],
        ["DOUBAO_TTS_RESOURCE_ID", config.doubaoResourceId],
        ["DOUBAO_TTS_BASE_URL", config.doubaoBaseUrl],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`请在 .codex/.env 中填写：${missing.join("、")}`);
    return config;
}

export async function loadSystemPrompt(skillDir) {
    const prompt = await readFile(path.join(skillDir, "assets", "tts-tone-optimizer.system.txt"), "utf8");
    if (!prompt.trim()) throw new Error("TTS 语气优化 System Prompt 不能为空");
    return prompt;
}

export async function requestDoubaoPcm(segment, input, dependencies = {}) {
    const fetcher = dependencies.fetcher || fetch;
    const uuid = dependencies.uuid || (() => crypto.randomUUID());
    const response = await fetcher(joinUrl(input.config.doubaoBaseUrl, "/tts/unidirectional"), {
        method: "POST",
        headers: {
            "X-Api-Key": input.config.doubaoApiKey,
            "X-Api-Resource-Id": input.config.doubaoResourceId,
            "X-Api-Request-Id": uuid(),
            "Content-Type": "application/json",
            Accept: "text/event-stream, application/octet-stream, application/json",
        },
        body: JSON.stringify({
            user: { uid: input.sectionId },
            namespace: "BidirectionalTTS",
            req_params: {
                text: segment.text,
                model: "seed-tts-2.0-expressive",
                speaker: input.voiceId,
                audio_params: {
                    format: "pcm",
                    sample_rate: 24000,
                    bit_rate: 128000,
                    speech_rate: 25,
                    loudness_rate: 0,
                },
                additions: JSON.stringify({
                    context_texts: segment.contextTexts,
                    tone_fidelity: true,
                    section_id: input.sectionId,
                }),
            },
        }),
        signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(await responseError(response, `豆包语音生成失败（${response.status}）`));
    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("audio/") || contentType.includes("octet-stream")) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.byteLength) throw new Error("豆包语音没有返回音频数据");
        return bytes;
    }
    const chunks = [];
    for (const item of parseJsonObjects(await response.text())) {
        if (item.code && Number(item.code) !== 20000000) throw new Error(item.message || `豆包语音生成失败（${item.code}）`);
        const audio = typeof item.data === "string" ? item.data : item.audio || item.data?.audio || item.data?.audio_data || item.data?.audio_base64 || item.audio_data;
        if (typeof audio === "string" && audio) chunks.push(Buffer.from(audio, "base64"));
    }
    if (!chunks.length) throw new Error("豆包语音没有返回音频数据");
    return new Uint8Array(Buffer.concat(chunks));
}

export function encodePcm16LeMonoToMp3(bytes, sampleRate = 24000, kbps = 128) {
    if (!bytes.byteLength || bytes.byteLength % 2) throw new Error("豆包语音返回了无效的 PCM 数据");
    const samples = new Int16Array(bytes.byteLength / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true);
    const encoder = new Mp3Encoder(1, sampleRate, kbps);
    const chunks = [];
    for (let offset = 0; offset < samples.length; offset += 1152) {
        const chunk = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
        if (chunk.length) chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    }
    const final = encoder.flush();
    if (final.length) chunks.push(Buffer.from(final.buffer, final.byteOffset, final.byteLength));
    const mp3 = new Uint8Array(Buffer.concat(chunks));
    if (!mp3.byteLength) throw new Error("MP3 编码没有产生音频数据");
    return mp3;
}

export async function runSpeechPipeline(input, dependencies = {}) {
    const uuid = dependencies.uuid || (() => crypto.randomUUID());
    const onProgress = dependencies.onProgress || (() => {});
    const outputPath = await resolveOutputPath(input.rootDir, input.output);
    const sectionId = uuid();
    let temporaryPath;
    try {
        onProgress("正在使用 DeepSeek V4 Flash 优化语气…");
        const segments = await optimizeTone(input, dependencies);
        onProgress(`语气结果校验通过，共 ${segments.length} 段。`);
        const pcmChunks = [];
        for (const [index, segment] of segments.entries()) {
            onProgress(`正在生成第 ${index + 1}/${segments.length} 段语音…`);
            pcmChunks.push(await requestDoubaoPcm(segment, {
                config: input.config,
                voiceId: input.voiceId,
                sectionId,
            }, dependencies));
        }
        onProgress("正在编码并保存 MP3…");
        const mp3 = encodePcm16LeMonoToMp3(new Uint8Array(Buffer.concat(pcmChunks)));
        temporaryPath = `${outputPath}.${uuid()}.tmp`;
        await writeFile(temporaryPath, mp3, { flag: "wx" });
        await link(temporaryPath, outputPath);
        await unlink(temporaryPath);
        temporaryPath = undefined;
        return path.resolve(outputPath);
    } finally {
        if (temporaryPath) await unlink(temporaryPath).catch(() => {});
    }
}

function parseJsonObjects(source) {
    const items = [];
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (start < 0) {
            if (char === "{") { start = index; depth = 1; }
            continue;
        }
        if (escaped) { escaped = false; continue; }
        if (quoted && char === "\\") { escaped = true; continue; }
        if (char === '"') { quoted = !quoted; continue; }
        if (!quoted && char === "{") depth += 1;
        if (!quoted && char === "}" && --depth === 0) {
            try {
                items.push(JSON.parse(source.slice(start, index + 1)));
            } catch {
                throw new Error("豆包语音返回了无效响应");
            }
            start = -1;
        }
    }
    return items;
}
