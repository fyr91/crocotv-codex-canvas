import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const NANO_BANANA_LITE_MODEL = "google:nano-banana@2-lite";
export const GPT_IMAGE_02_MODEL = "openai:gpt-image@2";
export const CROCO_FLOW_IMAGE_MODELS = [NANO_BANANA_LITE_MODEL, GPT_IMAGE_02_MODEL];

export function sameExecutablePath(argvPath, modulePath) {
    return Boolean(argvPath) && path.resolve(argvPath).normalize("NFC") === modulePath.normalize("NFC");
}

export function runwareConfig(env = process.env) {
    const config = { baseUrl: String(env.RUNWARE_BASE_URL || "https://api.runware.ai/v1").trim(), apiKey: String(env.RUNWARE_API_KEY || "").trim() };
    if (!config.apiKey) throw new Error("请在 .codex/.env 中填写 RUNWARE_API_KEY");
    return config;
}

export function buildRunwareImageRequest(input, uuid) {
    const references = input.referenceImages || [];
    const hasDimensions = Number.isInteger(input.width) && input.width > 0 && Number.isInteger(input.height) && input.height > 0;
    const model = String(input.model || NANO_BANANA_LITE_MODEL);
    if (!CROCO_FLOW_IMAGE_MODELS.includes(model)) throw new Error(`Croco Video Factory 图像路由不支持模型：${model}`);
    return {
        taskType: "imageInference", taskUUID: uuid, model, positivePrompt: input.prompt,
        deliveryMethod: "sync", outputType: "URL", outputFormat: "PNG", outputQuality: 90, numberResults: 1, includeCost: true,
        ...(model === GPT_IMAGE_02_MODEL
            ? { providerSettings: { openai: { quality: "auto", moderation: "low" } } }
            : { safety: { checkContent: true } }),
        ...(hasDimensions ? { width: input.width, height: input.height } : references.length ? { resolution: "1K" } : {}),
        ...(references.length ? { inputs: { referenceImages: references } } : {}),
    };
}

export function imageDimensionsForAspect(aspectRatio) {
    const ratio = String(aspectRatio || "16:9").trim();
    if (ratio === "9:16") return { aspectRatio: ratio, width: 768, height: 1376 };
    if (ratio === "3:4") return { aspectRatio: ratio, width: 896, height: 1200 };
    if (ratio === "4:3") return { aspectRatio: ratio, width: 1200, height: 896 };
    if (ratio === "16:9") return { aspectRatio: ratio, width: 1376, height: 768 };
    throw new Error(`Croco Video Factory 图像路由不支持项目画幅：${ratio}`);
}

export async function assertPngDimensions(filePath, expected) {
    const buffer = await readFile(filePath);
    if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") throw new Error(`生成结果不是有效 PNG：${filePath}`);
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    if (width !== expected.width || height !== expected.height) throw new Error(`生成图片尺寸错误：期望 ${expected.width}×${expected.height}，实际 ${width}×${height}`);
    return { width, height };
}

export async function fileDataUri(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${(await readFile(filePath)).toString("base64")}`;
}

export async function generateRunwareImage(input, dependencies = {}) {
    const fetcher = dependencies.fetcher || fetch;
    const uuid = (dependencies.uuid || (() => crypto.randomUUID()))();
    const request = buildRunwareImageRequest(input, uuid);
    const response = await fetcher(input.config.baseUrl.replace(/\/$/, ""), {
        method: "POST", headers: { Authorization: `Bearer ${input.config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify([request]), signal: input.signal,
    });
    const payload = await parsePayload(response);
    if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.map((item) => item.message).filter(Boolean).join("；") || `Runware 请求失败（${response.status}）`);
    const item = payload.data?.find((value) => value.taskUUID === uuid);
    if (!item?.imageURL) throw new Error("Runware 没有返回图片地址");
    const image = await fetcher(item.imageURL, { signal: input.signal });
    if (!image.ok) throw new Error(`Runware 图片下载失败（${image.status}）`);
    const temporary = `${input.outputPath}.${process.pid}.tmp`;
    await writeFile(temporary, Buffer.from(await image.arrayBuffer()));
    await rename(temporary, input.outputPath);
    return { model: request.model, taskUUID: uuid, imageUUID: item.imageUUID || null, seed: item.seed ?? null, cost: Number(item.cost) || 0, promptSha256: createHash("sha256").update(input.prompt).digest("hex") };
}

async function parsePayload(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error(response.ok ? "Runware 返回了无效响应" : text.slice(0, 300)); }
}
