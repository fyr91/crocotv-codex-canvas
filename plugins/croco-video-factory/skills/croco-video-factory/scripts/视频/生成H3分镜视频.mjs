#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildH3Request, downloadH3, ensureH3Runtime, getH3Job, h3Config, h3ProfileForAspect, submitH3Job, uploadH3Asset } from "../公共/h3-client.mjs";
import { buildPromptInputHashes, generateH3Prompt, promptConfig } from "./生成H3提示词.mjs";

export function normalizeContinuity(shot) {
    const value = shot?.continuity;
    if (!value || value.type === "independent") return null;
    if (!["soft-continuity", "tail-frame"].includes(value.type)) throw new Error(`${shot.folder} 的 continuity.type 不受支持：${value.type}`);
    return value;
}

export function validateShotDependencies(shots) {
    const ids = new Set();
    const indexes = new Map();
    shots.forEach((shot, index) => {
        if (!Number.isInteger(shot.id) || ids.has(shot.id)) throw new Error("分镜计划中的 shot.id 必须是唯一整数");
        if (!String(shot.folder || "").trim()) throw new Error(`分镜 ${shot.id} 缺少 folder`);
        ids.add(shot.id); indexes.set(shot.id, index);
    });
    shots.forEach((shot, index) => {
        if (shot.sceneDesignRequired !== false && (!String(shot.storySegmentId || "").trim() || !sceneIdsOf(shot).length)) throw new Error(`${shot.folder} 缺少 storySegmentId 或 sceneIds`);
        const value = normalizeContinuity(shot);
        if (!value) return;
        if (value.type === "soft-continuity") return;
        if (!Number.isInteger(value.dependsOnShotId) || !indexes.has(value.dependsOnShotId)) throw new Error(`${shot.folder} 的 continuity 依赖不存在`);
        if (indexes.get(value.dependsOnShotId) >= index) throw new Error(`${shot.folder} 只能依赖时间线上更早的分镜`);
    });
    return true;
}

export async function generateProjectShots({ projectDir, config = h3Config(), ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg", ffprobePath = process.env.FFPROBE_PATH || "ffprobe" }, dependencies = {}) {
    const shotsRoot = path.join(projectDir, "分镜");
    const plan = JSON.parse(await readFile(path.join(shotsRoot, "分镜计划.json"), "utf8"));
    const shots = Array.isArray(plan.shots) ? plan.shots.map((shot) => ({ ...shot, projectAspectRatio: plan.aspectRatio || "16:9" })) : [];
    if (!shots.length) throw new Error("分镜计划.json 没有可生成的 shots");
    validateShotDependencies(shots);
    await ensureH3Runtime(config, dependencies);
    const cachePath = path.join(projectDir, "运行状态", "H3素材缓存.json");
    await mkdir(path.dirname(cachePath), { recursive: true });
    let cache = {}; try { cache = JSON.parse(await readFile(cachePath, "utf8")); } catch {}
    let cacheWrite = Promise.resolve();
    const persistCache = () => cacheWrite = cacheWrite.then(() => atomicJson(cachePath, cache));
    const assetUploads = new Map();
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const tasks = new Map();
    const runShot = (shot) => {
        if (tasks.has(shot.id)) return tasks.get(shot.id);
        const task = (async () => {
            const continuity = normalizeContinuity(shot);
            let parentPointer = null;
            if (continuity?.type === "tail-frame") {
                const parent = byId.get(continuity.dependsOnShotId);
                parentPointer = await runShot(parent);
                parentPointer = await ensureLastFrame({ projectDir, shot: parent, pointer: parentPointer, ffmpegPath }, dependencies);
            }
            const shotDir = path.join(shotsRoot, shot.folder);
            const videoDir = path.join(shotDir, "视频生成");
            const manifestPath = path.join(videoDir, "H3参考素材.json");
            let manifest = await optionalJson(manifestPath);
            const promptInvalidated = await promptNeedsRegeneration({ manifest, shot, shotDir, videoDir, projectDir, parentPointer });
            if (promptInvalidated) {
                await generateH3Prompt({ shotDir, config: dependencies.promptConfig || promptConfig() }, dependencies.promptDependencies || {});
                manifest = await optionalJson(manifestPath);
            }
            if (!manifest) throw new Error(`${shot.folder} 缺少 H3参考素材.json`);
            if (!(await manifestMatchesShot({ manifest, shot, shotDir, videoDir, projectDir, parentPointer }))) throw new Error(`${shot.folder} 的 H3参考素材.json 与当前场景或依赖不一致`);
            let pointer = await optionalJson(path.join(videoDir, "当前视频.json"));
            const pointerDependencyChanged = continuity?.type === "tail-frame" && pointer?.continuity?.sourceLastFrameSha256 !== parentPointer.lastFrameSha256;
            if (pointer?.status === "succeeded" && !pointerDependencyChanged && !promptInvalidated) return ensureLastFrame({ projectDir, shot, pointer, ffmpegPath }, dependencies);
            if (pointer?.status === "succeeded") await archiveShotOutput(videoDir, pointer);
            pointer = await processShot({ projectDir, manifestPath, config, cache, persistCache, assetUploads, forceNew: pointerDependencyChanged || promptInvalidated, ffprobePath }, dependencies);
            return ensureLastFrame({ projectDir, shot, pointer, ffmpegPath }, dependencies);
        })();
        tasks.set(shot.id, task);
        return task;
    };
    return Promise.all(shots.map(runShot));
}

export async function promptNeedsRegeneration(input) {
    return !input.manifest || !(await manifestMatchesShot(input));
}

export async function manifestMatchesShot({ manifest, shot, shotDir, videoDir, projectDir, parentPointer = null }) {
    if (manifest?.schemaVersion !== 5) return false;
    const profile = h3ProfileForAspect(shot.projectAspectRatio);
    if (manifest.aspectRatio !== profile.aspectRatio || manifest.quality !== profile.quality || manifest.expectedWidth !== profile.width || manifest.expectedHeight !== profile.height) return false;
    if ((manifest.storySegmentId || null) !== (shot.storySegmentId || null) || JSON.stringify(sceneIdsOf(manifest)) !== JSON.stringify(sceneIdsOf(shot))) return false;
    if (String(manifest.shotId || "") !== String(shot.shotId ?? shot.id ?? "") || String(manifest.generationSegmentId || "") !== String(shot.generationSegmentId ?? shot.shotId ?? shot.id ?? "")) return false;
    if (Boolean(manifest.sceneDesignRequired) !== (shot.sceneDesignRequired !== false)) return false;
    const continuity = normalizeContinuity(shot);
    if (continuity?.type === "tail-frame") {
        if (!parentPointer || manifest.continuity?.type !== "tail-frame" || manifest.continuity.dependsOnShotId !== continuity.dependsOnShotId || manifest.continuity.sourceLastFrameSha256 !== parentPointer.lastFrameSha256) return false;
    } else if (manifest.continuity) return false;
    let currentInputHashes;
    try { currentInputHashes = await buildPromptInputHashes({ projectDir, shotDir, plannedShot: shot }); } catch { return false; }
    if (!manifest.inputHashes || JSON.stringify(manifest.inputHashes) !== JSON.stringify(currentInputHashes)) return false;
    if (shot.sceneDesignRequired === false) return !(manifest.sceneReferences || []).length;
    if (!(manifest.sceneReferences || []).length || !manifest.sceneReferenceManifestSha256) return false;
    let sceneManifest;
    try { sceneManifest = await readFile(path.join(shotDir, "场景参考图.json")); } catch { return false; }
    if (createHash("sha256").update(sceneManifest).digest("hex") !== manifest.sceneReferenceManifestSha256) return false;
    for (const item of manifest.sceneReferences) {
        if (!item.imageSha256 || !sceneIdsOf(shot).includes(item.sceneId)) return false;
        let image;
        try { image = await readFile(safeProjectPath(projectDir, videoDir, item.path)); } catch { return false; }
        if (createHash("sha256").update(image).digest("hex") !== item.imageSha256) return false;
    }
    return true;
}

async function processShot(input, dependencies) {
    const directory = path.dirname(input.manifestPath), manifest = JSON.parse(await readFile(input.manifestPath, "utf8"));
    const statePath = path.join(directory, "H3任务状态.json");
    let state = input.forceNew ? {} : await optionalJson(statePath) || {};
    const assets = async (items, kind) => Promise.all((items || []).map(async (item) => {
        const filePath = safeProjectPath(input.projectDir, directory, item.path);
        const key = `${kind}:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
        if (!input.cache[key]) {
            if (!input.assetUploads.has(key)) input.assetUploads.set(key, uploadH3Asset({ config: input.config, kind, filePath }, dependencies).then(async (assetId) => { input.cache[key] = assetId; await input.persistCache(); return assetId; }));
            await input.assetUploads.get(key);
        }
        return input.cache[key];
    }));
    let jobId = state.jobId;
    if (!jobId) {
        const externalJobId = state.externalJobId || randomUUID();
        await atomicJson(statePath, { status: "submitting", externalJobId });
        const [images, audios, prompt] = await Promise.all([assets(manifest.images, "images"), assets(manifest.audios, "audio"), readFile(path.resolve(directory, manifest.promptPath), "utf8")]);
        const response = await submitH3Job({ config: input.config, request: buildH3Request({ externalJobId, prompt, durationSeconds: manifest.durationSeconds, quality: manifest.quality, imageAssetIds: images, audioAssetIds: audios }), idempotencyKey: externalJobId }, dependencies);
        jobId = response.items?.[0]?.job_id;
        if (!jobId) throw new Error("H3 没有返回 Job ID");
        await atomicJson(statePath, { status: "queued", externalJobId, jobId, batchId: response.batch_id });
    }
    let job;
    do { job = await getH3Job({ config: input.config, jobId }, dependencies); await atomicJson(statePath, { ...state, status: job.status, jobId, stage: job.stage, progress: job.progress }); if (["queued", "running"].includes(job.status)) await (dependencies.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(5000); } while (["queued", "running"].includes(job.status));
    if (job.status !== "succeeded") throw new Error(job.error || `H3 任务${job.status}`);
    if (job.width !== manifest.expectedWidth || job.height !== manifest.expectedHeight || job.duration_seconds !== manifest.durationSeconds) throw new Error(`H3 输出规格与请求不一致：期望 ${manifest.expectedWidth}×${manifest.expectedHeight}`);
    const [video, poster] = await Promise.all([downloadH3({ config: input.config, jobId }, dependencies), downloadH3({ config: input.config, jobId, kind: "poster" }, dependencies)]);
    if (!video.length || !poster.length) throw new Error("H3 输出文件为空");
    const videoPath = path.join(directory, "分镜视频.mp4");
    await writeFile(videoPath, video); await writeFile(path.join(directory, "分镜视频封面.jpg"), poster);
    const actualDurationSeconds = dependencies.probeDuration ? await dependencies.probeDuration(videoPath) : await probeDuration(input.ffprobePath, videoPath);
    const pointer = { status: "succeeded", jobId, path: "分镜视频.mp4", posterPath: "分镜视频封面.jpg", shotId: manifest.shotId, generationSegmentId: manifest.generationSegmentId, seed: job.seed, width: job.width, height: job.height, aspectRatio: manifest.aspectRatio, quality: manifest.quality, targetDurationSeconds: manifest.targetDurationSeconds ?? manifest.durationSeconds, actualDurationSeconds, durationSeconds: actualDurationSeconds, ...(manifest.continuity ? { continuity: manifest.continuity } : {}) };
    await atomicJson(path.join(directory, "当前视频.json"), pointer); await atomicJson(statePath, pointer); return pointer;
}

export async function ensureLastFrame({ projectDir, shot, pointer, ffmpegPath = "ffmpeg" }, dependencies = {}) {
    const videoDir = path.join(projectDir, "分镜", shot.folder, "视频生成");
    const outputPath = path.join(videoDir, "尾帧.png");
    if (pointer.lastFramePath && pointer.lastFrameSha256) {
        try { await stat(safeProjectPath(projectDir, videoDir, pointer.lastFramePath)); return pointer; } catch {}
    }
    const videoPath = safeProjectPath(projectDir, videoDir, pointer.path);
    const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp.png`;
    if (dependencies.extractLastFrame) await dependencies.extractLastFrame({ videoPath, outputPath: temporaryPath });
    else await runCommand(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-sseof", "-1", "-i", videoPath, "-an", "-update", "1", "-y", temporaryPath]);
    const frame = await readFile(temporaryPath);
    if (!frame.length) throw new Error(`${shot.folder} 提取的尾帧为空`);
    await rename(temporaryPath, outputPath);
    const next = { ...pointer, lastFramePath: "尾帧.png", lastFrameSha256: createHash("sha256").update(frame).digest("hex") };
    await atomicJson(path.join(videoDir, "当前视频.json"), next);
    await atomicJson(path.join(videoDir, "H3任务状态.json"), next);
    return next;
}

async function archiveShotOutput(videoDir, pointer) {
    const historyDir = path.join(videoDir, "历史版本", `依赖失效-${pointer.jobId || randomUUID()}`);
    await mkdir(historyDir, { recursive: true });
    for (const name of ["当前视频.json", "H3任务状态.json", pointer.path, pointer.posterPath, pointer.lastFramePath].filter(Boolean)) {
        const source = path.join(videoDir, name);
        try { await rename(source, path.join(historyDir, path.basename(name))); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
}

async function optionalJson(filePath) {
    try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function sceneIdsOf(shot) {
    const values = Array.isArray(shot?.sceneIds) ? shot.sceneIds : shot?.sceneId ? [shot.sceneId] : [];
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function runCommand(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit" });
        child.once("error", (error) => reject(error.code === "ENOENT" ? new Error(`找不到 FFmpeg：${command}，请在 .codex/.env 配置 FFMPEG_PATH`) : error));
        child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`FFmpeg 尾帧提取失败（${signal ? `signal ${signal}` : `exit ${code}`}）`)));
    });
}

async function probeDuration(command, inputPath) {
    return new Promise((resolve, reject) => {
        let output = "", error = "";
        const child = spawn(command, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inputPath], { stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk);
        child.once("error", (reason) => reject(reason.code === "ENOENT" ? new Error(`找不到 FFprobe：${command}`) : reason));
        child.once("exit", (code) => {
            if (code !== 0) return reject(new Error(`FFprobe 读取实际时长失败：${error.trim()}`));
            const value = Number(output.trim());
            return value > 0 ? resolve(Number(value.toFixed(3))) : reject(new Error(`FFprobe 返回无效时长：${output.trim()}`));
        });
    });
}

function safeProjectPath(projectDir, base, value) { const resolved = path.resolve(base, value); if (resolved !== projectDir && !resolved.startsWith(`${projectDir}${path.sep}`)) throw new Error("参考素材路径超出项目目录"); return resolved; }
async function atomicJson(target, value) { const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, target); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { const index = process.argv.indexOf("--project"); if (index < 0) throw new Error("缺少 --project"); process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env")); console.log(JSON.stringify(await generateProjectShots({ projectDir: path.resolve(process.argv[index + 1]) }), null, 2)); }
    catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}
