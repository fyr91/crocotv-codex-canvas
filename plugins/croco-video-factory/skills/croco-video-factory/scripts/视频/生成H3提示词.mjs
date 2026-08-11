#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { h3ProfileForAspect } from "../公共/h3-client.mjs";
import { assertPngDimensions, fileDataUri, imageDimensionsForAspect, sameExecutablePath } from "../公共/runware-client.mjs";

const skillDir = fileURLToPath(new URL("../../", import.meta.url));
const envPath = process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac"]);
const sectionLabels = ["subject_definitions:", "summary:", "retention_analysis:", "detailed_description:", "overall_soundscape:", "non_diegetic_music:"];

export async function generateH3Prompt({ shotDir, config }, dependencies = {}) {
    const directory = path.resolve(shotDir);
    const projectDir = path.dirname(path.dirname(directory));
    const [shot, style, pointer, characterFile, sceneFile, plannedShot] = await Promise.all([
        readFile(path.join(directory, "分镜内容.md"), "utf8"),
        readFile(path.join(path.dirname(directory), "整体视觉风格.md"), "utf8"),
        readJson(path.join(directory, "当前分镜图.json")),
        readJson(path.join(directory, "角色参考图.json")),
        optionalJson(path.join(directory, "场景参考图.json")),
        readCurrentShotPlan(projectDir, directory),
    ]);
    const storyboardPath = safeProjectPath(projectDir, directory, pointer.imagePath);
    const imageDimensions = imageDimensionsForAspect(plannedShot.projectAspectRatio);
    await assertPngDimensions(storyboardPath, imageDimensions);
    const continuity = await readContinuityContext(projectDir, directory);
    const storyboardNumber = continuity ? 2 : 1;
    if (plannedShot.sceneDesignRequired !== false && (!plannedShot.sceneId || !plannedShot.storySegmentId || sceneFile?.sceneId !== plannedShot.sceneId || sceneFile?.storySegmentId !== plannedShot.storySegmentId || !(sceneFile?.references || []).length)) throw new Error("当前分镜缺少与分镜计划匹配的已验收场景参考图");
    const scenes = [];
    for (const [index, item] of (sceneFile?.references || []).entries()) {
        const scenePath = safeProjectPath(projectDir, directory, item.path);
        await assertPngDimensions(scenePath, imageDimensions);
        const imageSha256 = createHash("sha256").update(await readFile(scenePath)).digest("hex");
        if (item.imageSha256 && imageSha256 !== item.imageSha256) throw new Error(`场景参考图哈希失效：${item.path}`);
        scenes.push({ label: `Picture ${index + storyboardNumber + 1}`, sceneId: String(sceneFile.sceneId || plannedShot.sceneId || ""), view: String(item.view || `场景视图 ${index + 1}`), purpose: String(item.purpose || "锁定空间、灯光、材质和固定道具"), path: scenePath, imageSha256 });
    }
    const characters = (characterFile.references || []).map((item, index) => ({
        label: `Picture ${index + storyboardNumber + scenes.length + 1}`,
        character: String(item.character || `角色 ${index + 1}`),
        identity: String(item.identity || ""),
        purpose: String(item.purpose || ""),
        path: safeProjectPath(projectDir, directory, item.path),
    }));
    const storyboard = { label: `Picture ${storyboardNumber}`, path: storyboardPath, role: "Storyboard planning reference only; never a first frame, last frame, or keyframe" };
    const images = [...(continuity ? [{ label: "Picture 1", path: continuity.firstFramePath, role: `Exact first frame inherited from ${continuity.dependsOnFolder}` }] : []), storyboard, ...scenes.map((item) => ({ label: item.label, path: item.path, role: `${item.sceneId} ${item.view} accepted scene-design reference` })), ...characters.map((item) => ({ label: item.label, path: item.path, role: `${item.character} character-design reference only` }))];
    if (images.length > 9) throw new Error("H3 图片 Reference 最多 9 张");
    for (const item of images) if (!imageExtensions.has(path.extname(item.path).toLowerCase())) throw new Error(`不支持的图片格式：${item.path}`);

    const audioDir = path.join(directory, "旁白或对白音频");
    const audios = await listMedia(audioDir, audioExtensions);
    if (audios.length > 3) throw new Error("H3 音频 Reference 最多 3 段");
    const durationSeconds = parseDuration(shot);
    const profile = h3ProfileForAspect(plannedShot.projectAspectRatio);
    const inputHashes = await buildPromptInputHashes({ projectDir, shotDir: directory, plannedShot });
    const runtimeText = buildRuntimeText({ shot, style, durationSeconds, scenes, characters, continuity, storyboardLabel: storyboard.label, profile });
    const content = [{ type: "text", text: runtimeText }];
    if (continuity) {
        content.push({ type: "text", text: `<Picture 1> follows immediately. It is the exact first frame at 00:00.000 inherited from ${continuity.dependsOnFolder}; preserve its composition, character pose, camera direction, lighting, and other declared continuity attributes before developing forward.` });
        content.push({ type: "image_url", image_url: { url: await fileDataUri(continuity.firstFramePath) } });
    }
    content.push({ type: "text", text: `<${storyboard.label}> follows immediately. It is the accepted Storyboard planning reference only. It is NOT the first frame, last frame, keyframe, or a frame-matching target.` });
    content.push({ type: "image_url", image_url: { url: await fileDataUri(storyboardPath) } });
    for (const item of scenes) {
        content.push({ type: "text", text: `<${item.label}> follows immediately. It is an accepted scene-design source for ${item.sceneId} (${item.view}); preserve its spatial layout, lighting direction, palette, materials, fixed furniture, and prop anchors without copying any characters or text.` });
        content.push({ type: "image_url", image_url: { url: await fileDataUri(item.path) } });
    }
    for (const item of characters) {
        content.push({ type: "text", text: `<${item.label}> follows immediately. It is the character-design source for ${item.character}; use it only to define that character's stable identity and appearance.` });
        content.push({ type: "image_url", image_url: { url: await fileDataUri(item.path) } });
    }

    const systemPrompt = await readFile(path.join(skillDir, "references", "H3-Ref2VA-System-Prompt.txt"), "utf8");
    const fetcher = dependencies.fetcher || fetch;
    const response = await fetcher(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content }], stream: false }),
        signal: AbortSignal.timeout(420_000),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const payload = await response.json();
    const basePrompt = String(payload?.choices?.[0]?.message?.content || "").trim();
    validatePrompt(basePrompt);
    validateVisibleTextPolicy(basePrompt, shot);
    const audioReferences = audios.map((item, index) => buildAudioReference(item.path, index));
    const prompt = appendAudioReferences(basePrompt, audioReferences);
    if (prompt.length > 20000) throw new Error("追加音频 Reference 后的 H3 Prompt 超过 20000 字符");

    const videoDir = path.join(directory, "视频生成");
    await mkdir(videoDir, { recursive: true });
    await writeFile(path.join(videoDir, "视频提示词输入.md"), buildInputRecord({ runtimeText, images, audios, videoDir }), "utf8");
    await writeFile(path.join(videoDir, "视频提示词-优化后.md"), `${prompt}\n`, "utf8");
    await writeFile(path.join(videoDir, "H3参考素材.json"), `${JSON.stringify({
        schemaVersion: 3,
        mode: "r2v",
        quality: profile.quality,
        aspectRatio: profile.aspectRatio,
        expectedWidth: profile.width,
        expectedHeight: profile.height,
        steps: 20,
        refImageSize: "match",
        durationSeconds,
        inputHashes,
        promptPath: "视频提示词-优化后.md",
        storySegmentId: plannedShot.storySegmentId || null,
        sceneId: plannedShot.sceneId || null,
        sceneDesignRequired: plannedShot.sceneDesignRequired !== false,
        sceneReferenceManifestSha256: sceneFile ? createHash("sha256").update(await readFile(path.join(directory, "场景参考图.json"))).digest("hex") : null,
        sceneReferences: scenes.map((item) => ({ sceneId: item.sceneId, view: item.view, path: path.relative(videoDir, item.path), imageSha256: item.imageSha256 })),
        ...(continuity ? { continuity: { type: "tail-frame", dependsOnShotId: continuity.dependsOnShotId, dependsOnFolder: continuity.dependsOnFolder, sourceJobId: continuity.sourceJobId, sourceLastFrameSha256: continuity.sourceLastFrameSha256 } } : {}),
        images: images.map((item) => ({ ...item, path: path.relative(videoDir, item.path) })),
        audios: audioReferences.map((item) => ({ label: item.label, path: path.relative(videoDir, item.path), role: item.role })),
    }, null, 2)}\n`, "utf8");
    return { promptPath: path.join(videoDir, "视频提示词-优化后.md"), manifestPath: path.join(videoDir, "H3参考素材.json") };
}

export async function buildPromptInputHashes({ projectDir, shotDir, plannedShot }) {
    const directory = path.resolve(shotDir);
    const storyboardDir = path.dirname(directory);
    const storyboardPointerPath = path.join(directory, "当前分镜图.json");
    const characterManifestPath = path.join(directory, "角色参考图.json");
    const [shotContent, overallStyle, storyboardPointerBytes, characterManifestBytes] = await Promise.all([
        readFile(path.join(directory, "分镜内容.md")),
        readFile(path.join(storyboardDir, "整体视觉风格.md")),
        readFile(storyboardPointerPath),
        readFile(characterManifestPath),
    ]);
    const storyboardPointer = JSON.parse(storyboardPointerBytes.toString("utf8"));
    const characterManifest = JSON.parse(characterManifestBytes.toString("utf8"));
    const storyboardImagePath = safeProjectPath(projectDir, directory, storyboardPointer.imagePath);
    const characterImages = [];
    for (const item of characterManifest.references || []) {
        const imagePath = safeProjectPath(projectDir, directory, item.path);
        characterImages.push({
            character: String(item.character || ""),
            path: String(item.path || ""),
            imageSha256: sha256(await readFile(imagePath)),
        });
    }
    return {
        shotContentSha256: sha256(shotContent),
        overallStyleSha256: sha256(overallStyle),
        storyboardPointerSha256: sha256(storyboardPointerBytes),
        storyboardImageSha256: sha256(await readFile(storyboardImagePath)),
        characterReferenceManifestSha256: sha256(characterManifestBytes),
        characterImages,
        shotPlanSha256: sha256(Buffer.from(JSON.stringify(plannedShot))),
    };
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function buildRuntimeText({ shot, style, durationSeconds, scenes, characters, continuity, storyboardLabel, profile }) {
    return [
        "Create the final MiniMax H3 Ref2VA prompt from the following runtime production brief.",
        `Target duration: ${durationSeconds} seconds.`,
        `Native output framing: ${profile.aspectRatio} ${profile.width}x${profile.height}. Compose every shot directly for this canvas; do not generate another aspect ratio for later cropping, padding, reframing, or conversion.`,
        ...(continuity ? [`First-frame continuity policy: <Picture 1> is the exact first frame at 00:00.000 inherited from ${continuity.dependsOnFolder}. Begin from it exactly, then develop forward while preserving ${continuity.inherit.join(", ") || "the declared visual continuity"}. Dependency reason: ${continuity.reason || "continuous action across the shot boundary"}.`] : []),
        `Storyboard policy: <${storyboardLabel}> is planning guidance only. Use its shot order, framing, composition, staging, action beats, camera movement, transitions, and dynamics. Never treat it as a first frame, last frame, keyframe, or frame-matching target, and never copy its monochrome sketch style, panel layout, annotations, numbering, or production-document appearance.`,
        `Accepted scene-design references: ${scenes.length ? scenes.map((item) => `<${item.label}> = ${item.sceneId}; ${item.view}; ${item.purpose}`).join("\n") : "None; this is an explicitly synthetic scene."}`,
        `Character-design references: ${characters.length ? characters.map((item) => `<${item.label}> = ${item.character}${item.identity ? `; ${item.identity}` : ""}${item.purpose ? `; ${item.purpose}` : ""}`).join("\n") : "None."}`,
        "CURRENT SHOT STORYBOARD TEXT:", shot.trim(),
        "OVERALL VIDEO STYLE:", style.trim(),
    ].join("\n\n");
}

export async function readContinuityContext(projectDir, directory) {
    let plan;
    try { plan = await readJson(path.join(projectDir, "分镜", "分镜计划.json")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
    const currentIndex = (plan.shots || []).findIndex((item) => (item.folder || item.directory) === path.basename(directory));
    const current = (plan.shots || [])[currentIndex];
    if (!current) throw new Error("分镜计划.json 中找不到当前分镜");
    if (current.sceneDesignRequired !== false && (!current.sceneId || !current.storySegmentId)) throw new Error(`${current.folder} 缺少 sceneId 或 storySegmentId`);
    const previous = currentIndex > 0 ? plan.shots[currentIndex - 1] : null;
    if (previous && current.sceneId === previous.sceneId && current.storySegmentId === previous.storySegmentId) {
        const expectedParentId = previous.id ?? previous.shotId;
        if (current.continuity?.type !== "tail-frame" || current.continuity?.dependsOnShotId !== expectedParentId) throw new Error(`${current.folder} 与前镜属于同一故事场景，必须 tail-frame 依赖前镜`);
    }
    const dependency = current?.continuity;
    if (!dependency || ["independent", "soft-continuity"].includes(dependency.type)) return null;
    if (dependency.type !== "tail-frame") throw new Error(`不支持的 continuity.type：${dependency.type}`);
    if (!Number.isInteger(dependency.dependsOnShotId)) throw new Error(`${current.folder} 的 tail-frame 依赖缺少 dependsOnShotId`);
    const parent = (plan.shots || []).find((item) => item.id === dependency.dependsOnShotId);
    if (!parent) throw new Error(`${current.folder} 的前置分镜不存在：${dependency.dependsOnShotId}`);
    const parentVideoDir = path.join(projectDir, "分镜", parent.folder, "视频生成");
    const pointer = await readJson(path.join(parentVideoDir, "当前视频.json"));
    if (pointer.status !== "succeeded") throw new Error(`${current.folder} 正在等待前置分镜 ${parent.folder}`);
    if (!pointer.lastFramePath || !pointer.lastFrameSha256) throw new Error(`${parent.folder} 缺少可继承的尾帧，请先提取尾帧`);
    const firstFramePath = safeProjectPath(projectDir, parentVideoDir, pointer.lastFramePath);
    await stat(firstFramePath);
    return { type: "tail-frame", dependsOnShotId: parent.id, dependsOnFolder: parent.folder, firstFramePath, sourceJobId: pointer.jobId, sourceLastFrameSha256: pointer.lastFrameSha256, reason: String(dependency.reason || ""), inherit: Array.isArray(dependency.inherit) ? dependency.inherit.map(String) : [] };
}

async function readCurrentShotPlan(projectDir, directory) {
    const plan = await readJson(path.join(projectDir, "分镜", "分镜计划.json"));
    const shot = (plan.shots || []).find((item) => (item.folder || item.directory) === path.basename(directory));
    if (!shot) throw new Error("分镜计划.json 中找不到当前分镜");
    return { ...shot, projectAspectRatio: plan.aspectRatio || "16:9" };
}

async function optionalJson(filePath) { try { return await readJson(filePath); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

function buildInputRecord({ runtimeText, images, audios, videoDir }) {
    const imageLines = images.map((item) => `- <${item.label}>：${path.relative(videoDir, item.path)}；${item.role}`);
    const audioLines = audios.map((item, index) => {
        const reference = buildAudioReference(item.path, index);
        return `- <${reference.label}>：${path.relative(videoDir, item.path)}；${reference.role}`;
    });
    return `# H3 Prompt 组装记录\n\n## 豆包文字输入\n\n${runtimeText}\n\n## 豆包图片输入\n\n${imageLines.join("\n") || "- 无"}\n\n## 豆包输出后追加的音频 References\n\n${audioLines.join("\n") || "- 无"}\n`;
}

function buildAudioReference(filePath, index) {
    const stem = path.basename(filePath, path.extname(filePath));
    const isNarration = stem.includes("旁白");
    const isDialogue = stem.includes("对白") || stem.includes("台词");
    const character = stem.replace(/(?:旁白|对白|台词|配音)$/u, "").replace(/[-_\s]+$/u, "") || stem;
    const label = `Audio ${index + 1}`;
    if (isNarration) return {
        label, path: filePath,
        role: `${character} original complete off-screen narration`,
        instruction: `<${label}> is the original complete off-screen narration performed by ${character}. Reuse this supplied audio exactly without trimming, translation, paraphrase, re-recording, or voice replacement. Synchronize the video timing to <${label}> and keep every visible character's lips completely closed while it is heard unless the shot text explicitly specifies separate on-screen dialogue.`,
    };
    if (isDialogue) return {
        label, path: filePath,
        role: `${character} original complete on-screen dialogue`,
        instruction: `<${label}> is the original complete on-screen dialogue performed by ${character}. Reuse this supplied audio exactly without trimming, translation, paraphrase, re-recording, or voice replacement, and synchronize ${character}'s visible mouth movement precisely to <${label}>.`,
    };
    return {
        label, path: filePath,
        role: `${character} original complete character audio reference`,
        instruction: `<${label}> is the original complete character audio reference for ${character}. Reuse this supplied audio exactly without trimming, translation, paraphrase, re-recording, or voice replacement, following the shot text to determine whether it is off-screen narration or lip-synchronized on-screen speech.`,
    };
}

function appendAudioReferences(prompt, references) {
    if (!references.length) return prompt;
    return `${prompt}\n\naudio_references:\n${references.map((item) => item.instruction).join("\n")}`;
}

function parseDuration(markdown) {
    const match = markdown.match(/最终视频时长[^0-9]*(\d+(?:\.\d+)?)\s*秒/);
    if (!match) throw new Error("分镜内容.md 缺少最终视频时长");
    const value = Math.min(15, Math.floor(Number(match[1])));
    if (value < 3) throw new Error("H3 最终视频时长必须是 3–15 秒整数");
    return value;
}

function safeProjectPath(projectDir, base, value) {
    if (!String(value || "").trim()) throw new Error("参考素材路径不能为空");
    const resolved = path.resolve(base, value);
    if (resolved !== projectDir && !resolved.startsWith(`${projectDir}${path.sep}`)) throw new Error("参考素材路径超出项目目录");
    return resolved;
}

async function listMedia(directory, extensions) {
    try {
        return (await readdir(directory, { withFileTypes: true }))
            .filter((item) => item.isFile() && extensions.has(path.extname(item.name).toLowerCase()))
            .map((item) => ({ path: path.join(directory, item.name) }))
            .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}

function validatePrompt(prompt) {
    if (!prompt) throw new Error("豆包没有返回 H3 Prompt");
    if (prompt.length > 20000) throw new Error("豆包返回的 H3 Prompt 超过 20000 字符");
    let cursor = 0;
    for (const label of sectionLabels) {
        const index = prompt.indexOf(label, cursor);
        if (index < cursor || (label === sectionLabels[0] && index !== 0)) throw new Error(`豆包返回的 H3 Prompt 缺少或错序：${label}`);
        cursor = index + label.length;
    }
}

export function validateVisibleTextPolicy(prompt, shot) {
    const userRequested = /用户明确要求的画面文字\s*[:：]\s*(?!无(?:。|\s|$))\S/u.test(shot);
    const required = userRequested
        ? "No other subtitles, captions, labels, titles, interface text, logos, watermarks, letters, numbers, or readable text appear anywhere on screen."
        : "No subtitles, captions, labels, titles, interface text, logos, watermarks, letters, numbers, or other readable text appear anywhere on screen.";
    if (!prompt.includes(required)) throw new Error(`豆包返回的 H3 Prompt 缺少画面文字约束：${required}`);
}

export function promptConfig(env = process.env) {
    const config = {
        apiKey: String(env.ARK_API_KEY || "").trim(),
        model: String(env.ARK_MODEL || "").trim(),
        baseUrl: String(env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").trim(),
    };
    const missing = [["ARK_API_KEY", config.apiKey], ["ARK_MODEL", config.model], ["ARK_BASE_URL", config.baseUrl]].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`请在 .codex/.env 中填写：${missing.join("、")}`);
    return config;
}

async function responseError(response) {
    const fallback = `豆包 H3 Prompt 生成失败（${response.status}）`;
    try {
        const text = (await response.text()).trim();
        if (!text) return fallback;
        try { return JSON.parse(text)?.error?.message || fallback; } catch { return text.replace(/\s+/g, " ").slice(0, 500); }
    } catch { return fallback; }
}

if (sameExecutablePath(process.argv[1], fileURLToPath(import.meta.url))) {
    try {
        const index = process.argv.indexOf("--shot-dir");
        if (index < 0 || !process.argv[index + 1]) throw new Error("缺少 --shot-dir");
        process.loadEnvFile(envPath);
        console.log(JSON.stringify(await generateH3Prompt({ shotDir: process.argv[index + 1], config: promptConfig() }), null, 2));
    } catch (error) {
        console.error(`错误：${error.message}`);
        process.exitCode = 1;
    }
}
