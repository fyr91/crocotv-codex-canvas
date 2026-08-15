import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { generateText } from "./providers";
import { getPromptTemplate } from "./prompt-registry";
import { resourceById, safeResourcePath } from "./storage";

export const H3_PROMPT_TEMPLATE_KEY = "croco.h3.universal-ref2va";

const structuredFields = [
  "subject_definitions:",
  "summary:",
  "retention_analysis:",
  "detailed_description:",
  "overall_soundscape:",
  "non_diegetic_music:",
] as const;

export type H3PromptResourceRole = {
  resourceId: string;
  type: "image" | "audio";
  role: string;
  label?: string;
};

export type H3PromptPreparation = {
  draftPrompt: string;
  prompt: string;
  optimized: boolean;
  skippedReason?: "disabled" | "already-structured";
  templateKey?: string;
  templateVersion?: string;
  systemPromptSha256?: string;
  model?: string;
  inputMode: string;
  resourceRoles: H3PromptResourceRole[];
};

export async function prepareH3Prompt(input: {
  draftPrompt: string;
  durationSeconds: number;
  inputMode?: string;
  imageResourceIds?: string[];
  audioResourceIds?: string[];
  resourceRoles?: Array<{ resourceId?: unknown; type?: unknown; role?: unknown; label?: unknown }>;
  optimize?: boolean;
}, dependencies: {
  optimize?: (prompt: string, model: string, imageResourceIds: string[], systemPrompt: string) => Promise<string>;
} = {}): Promise<H3PromptPreparation> {
  const draftPrompt = String(input.draftPrompt || "").trim();
  if (!draftPrompt) throw new Error("H3 Prompt 不能为空");
  const inputMode = normalizeH3InputMode(input.inputMode);
  const resourceRoles = resolveH3ResourceRoles(inputMode, input.imageResourceIds || [], input.audioResourceIds || [], input.resourceRoles || []);
  if (input.optimize === false) return { draftPrompt, prompt: draftPrompt, optimized: false, skippedReason: "disabled", inputMode, resourceRoles };
  if (isStructuredH3Prompt(draftPrompt)) return { draftPrompt, prompt: draftPrompt, optimized: false, skippedReason: "already-structured", inputMode, resourceRoles };

  const template = await getPromptTemplate(H3_PROMPT_TEMPLATE_KEY);
  const runtimeBrief = buildH3RuntimeBrief({ draftPrompt, durationSeconds: input.durationSeconds, inputMode, resourceRoles });
  const imageResourceIds = resourceRoles.filter((item) => item.type === "image").map((item) => item.resourceId);
  const optimized = dependencies.optimize
    ? await dependencies.optimize(runtimeBrief, template.modelPolicy.defaultModel, imageResourceIds, template.systemPrompt)
    : await generateText(runtimeBrief, template.modelPolicy.defaultModel, [], await Promise.all(imageResourceIds.map(resourceImageDataUrl)), template.systemPrompt);
  const prompt = String(optimized).trim();
  if (!prompt) throw new Error("提示词优化没有返回 H3 Prompt");
  if (prompt.length > 20_000) throw new Error("优化后的 H3 Prompt 超过 20000 字符");
  return {
    draftPrompt,
    prompt,
    optimized: true,
    templateKey: template.templateKey,
    templateVersion: template.templateVersion,
    systemPromptSha256: createHash("sha256").update(template.systemPrompt, "utf8").digest("hex"),
    model: template.modelPolicy.defaultModel,
    inputMode,
    resourceRoles,
  };
}

async function resourceImageDataUrl(resourceId: string) {
  const resource = await resourceById(resourceId);
  if (!resource || !["image/png", "image/jpeg", "image/webp"].includes(resource.mimeType)) throw new Error(`H3 Prompt 图片参考不存在或格式不受支持：${resourceId}`);
  const bytes = await readFile(safeResourcePath(resource.fileName));
  return `data:${resource.mimeType};base64,${bytes.toString("base64")}`;
}

export function isStructuredH3Prompt(prompt: string) {
  const text = String(prompt || "").toLowerCase();
  let cursor = -1;
  for (const field of structuredFields) {
    const index = text.indexOf(field, cursor + 1);
    if (index < 0) return false;
    cursor = index;
  }
  return true;
}

export function normalizeH3InputMode(value: unknown) {
  const mode = String(value || "").trim().toLowerCase();
  if (["firstframe", "first_frame", "i2v"].includes(mode)) return "firstFrame";
  if (["firstlastframe", "first_last_frame", "fl2v"].includes(mode)) return "firstLastFrame";
  if (["multimodal", "referenceimages", "reference_images", "r2v"].includes(mode)) return "multimodal";
  return "text";
}

function resolveH3ResourceRoles(inputMode: string, imageIds: string[], audioIds: string[], explicit: Array<{ resourceId?: unknown; type?: unknown; role?: unknown; label?: unknown }>) {
  const explicitById = new Map(explicit.map((item) => [String(item.resourceId || ""), item]));
  const images = [...new Set(imageIds)].map((resourceId, index): H3PromptResourceRole => {
    const configured = explicitById.get(resourceId);
    const role = String(configured?.role || defaultImageRole(inputMode, index));
    return { resourceId, type: "image", role, label: String(configured?.label || `<Picture ${index + 1}>`) };
  });
  const audios = [...new Set(audioIds)].map((resourceId, index): H3PromptResourceRole => {
    const configured = explicitById.get(resourceId);
    return { resourceId, type: "audio", role: String(configured?.role || `audioReference${index + 1}`), label: String(configured?.label || `<Audio ${index + 1}>`) };
  });
  return [...images, ...audios];
}

function defaultImageRole(inputMode: string, index: number) {
  if (inputMode === "firstFrame" && index === 0) return "exactFirstFrame";
  if (inputMode === "firstLastFrame") return index === 0 ? "exactFirstFrame" : index === 1 ? "exactLastFrame" : `referenceImage${index + 1}`;
  return `referenceImage${index + 1}`;
}

function buildH3RuntimeBrief(input: { draftPrompt: string; durationSeconds: number; inputMode: string; resourceRoles: H3PromptResourceRole[] }) {
  const references = input.resourceRoles.length
    ? input.resourceRoles.map((item) => `${item.label}: ${item.role}`).join("\n")
    : "None. Do not invent reference labels.";
  return [
    "Create the final MiniMax H3 Ref2VA prompt from this runtime production brief.",
    `Target duration: ${input.durationSeconds} seconds.`,
    `User operation mode: ${input.inputMode}. This is a product editing semantic; produce one unified H3 Ref2VA prompt.`,
    "Ordered references (the labels follow the exact provider upload order):",
    references,
    "User draft prompt:",
    input.draftPrompt,
  ].join("\n\n");
}
