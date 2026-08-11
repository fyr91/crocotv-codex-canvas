#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { h3ProfileForAspect } from "../公共/h3-client.mjs";

const envPath = process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env");
const requiredVisualChecks = ["no-readable-text", "no-storyboard-marks", "style-consistent", "character-consistent", "clean-realistic-scenes", "scene-reference-consistent", "cross-shot-continuity"];

export async function mergeProjectShots({ projectDir, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg", ffprobePath = "ffprobe" } = {}, dependencies = {}) {
    const root = path.resolve(String(projectDir || ""));
    if (!projectDir) throw new Error("缺少 --project");
    const plan = JSON.parse(await readFile(path.join(root, "分镜", "分镜计划.json"), "utf8"));
    if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error("分镜计划.json 没有可合并的 shots");
    const profile = h3ProfileForAspect(plan.aspectRatio);
    const outputDir = path.join(root, "成片");
    const stateDir = path.join(root, "运行状态");
    await Promise.all([mkdir(outputDir, { recursive: true }), mkdir(stateDir, { recursive: true })]);
    const [dialogueReport, visualReport] = await Promise.all([
        readGate(path.join(outputDir, "对白验收-火山ASR.json"), "火山 ASR 对白验收"),
        readGate(path.join(outputDir, "H3视觉验收.json"), "H3 三帧视觉验收"),
    ]);
    const sources = [];
    for (const [index, shot] of plan.shots.entries()) {
        const folder = String(shot.folder || shot.directory || "");
        const shotId = String(shot.id ?? shot.shotId ?? index + 1).padStart(3, "0");
        if (shot.sceneDesignRequired !== false && (!shot.sceneId || !shot.storySegmentId)) throw new Error(`${folder} 缺少 sceneId 或 storySegmentId，拒绝合片`);
        const previous = index > 0 ? plan.shots[index - 1] : null;
        if (previous && shot.sceneId && shot.sceneId === previous.sceneId && shot.storySegmentId === previous.storySegmentId) {
            const previousId = previous.id ?? previous.shotId;
            if (shot.continuity?.type !== "tail-frame" || shot.continuity?.dependsOnShotId !== previousId) throw new Error(`${folder} 与前镜属于同一故事场景但没有直接 tail-frame 依赖，拒绝合片`);
        }
        const videoDir = path.join(root, "分镜", folder, "视频生成");
        const pointer = JSON.parse(await readFile(path.join(videoDir, "当前视频.json"), "utf8"));
        if (pointer.status !== "succeeded") throw new Error(`${folder} 当前视频未成功，不能合并完整视频`);
        const videoPath = safeProjectPath(root, videoDir, pointer.path);
        await stat(videoPath);
        const sceneFile = await optionalJson(path.join(root, "分镜", folder, "场景参考图.json"));
        if (shot.sceneDesignRequired !== false && (sceneFile?.sceneId !== shot.sceneId || sceneFile?.storySegmentId !== shot.storySegmentId || !(sceneFile?.references || []).length)) throw new Error(`${folder} 缺少匹配的场景参考图，拒绝合片`);
        const sceneReferenceSha256 = [];
        for (const reference of sceneFile?.references || []) {
            const imagePath = safeProjectPath(root, path.join(root, "分镜", folder), reference.path);
            const imageSha256 = await sha256File(imagePath);
            if (reference.imageSha256 && reference.imageSha256 !== imageSha256) throw new Error(`${folder} 场景参考图哈希已失效，拒绝合片`);
            sceneReferenceSha256.push(imageSha256);
        }
        sources.push({ shotId, folder, jobId: pointer.jobId || null, path: videoPath, sha256: await sha256File(videoPath), storySegmentId: shot.storySegmentId || null, sceneId: shot.sceneId || null, continuity: shot.continuity || { type: "independent" }, sceneReferenceSha256 });
    }
    verifyGates({ dialogueReport, visualReport, sources });
    const runId = `${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${randomUUID().slice(0, 8)}`;
    const stagingDir = path.join(stateDir, "H3安全合片", runId);
    await mkdir(stagingDir, { recursive: true });
    const media = await Promise.all(sources.map((source) => probeMedia(ffprobePath, source.path)));
    for (const [index, item] of media.entries()) if (item.video?.width !== profile.width || item.video?.height !== profile.height) throw new Error(`${sources[index].folder} 不是原生 ${profile.aspectRatio}（期望 ${profile.width}×${profile.height}），拒绝通过后期转换合片`);
    const canCopyEveryAudio = media.every((item) => item.audio?.codec_name === "aac" && Number(item.audio.sample_rate) === 32000 && Number(item.audio.channels) === 2);
    const staged = [];
    for (const [index, source] of sources.entries()) {
        const outputPath = path.join(stagingDir, `${source.shotId}.mp4`);
        const hasAudio = Boolean(media[index].audio);
        const args = ["-y", "-hide_banner", "-loglevel", "error", "-fflags", "+genpts", "-i", source.path];
        if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=32000:cl=stereo");
        args.push("-map", "0:v:0", "-map", hasAudio ? "0:a:0" : "1:a:0", "-vf", `fps=30,scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360");
        if (canCopyEveryAudio) args.push("-c:a", "copy");
        else args.push("-c:a", "aac", "-ar", "32000", "-ac", "2", "-b:a", "128k");
        if (!hasAudio) args.push("-shortest");
        args.push("-avoid_negative_ts", "make_zero", "-movflags", "+faststart", outputPath);
        await runCommand(ffmpegPath, args, dependencies);
        staged.push({ ...source, path: outputPath, media: await probeMedia(ffprobePath, outputPath) });
    }
    const concatPath = path.join(stagingDir, "concat.txt");
    await writeFile(concatPath, `${staged.map((item) => `file '${escapeConcatPath(item.path)}'`).join("\n")}\n`, "utf8");
    const outputPath = path.join(outputDir, "完整视频.mp4");
    const temporaryPath = path.join(outputDir, `完整视频.${process.pid}.${randomUUID()}.tmp.mp4`);
    await runCommand(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", temporaryPath], dependencies);
    await runCommand(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", temporaryPath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], dependencies);
    const [stagedAudioSha256, mergedAudioSha256] = await Promise.all([
        hashDecodedAudio(ffmpegPath, ["-f", "concat", "-safe", "0", "-i", concatPath]),
        hashDecodedAudio(ffmpegPath, ["-i", temporaryPath]),
    ]);
    if (stagedAudioSha256 !== mergedAudioSha256) throw new Error("安全合片失败：拼接前后 PCM 音频哈希不一致，拒绝发布");
    const result = await stat(temporaryPath);
    if (!result.size) throw new Error("合并后的视频文件为空");
    const outputMedia = await probeMedia(ffprobePath, temporaryPath);
    if (outputMedia.video?.width !== profile.width || outputMedia.video?.height !== profile.height || !outputMedia.audio) throw new Error(`安全合片输出规格不完整：期望 ${profile.width}×${profile.height}`);
    await archiveExisting(outputDir, outputPath);
    await rename(temporaryPath, outputPath);
    const pointer = {
        status: "succeeded",
        path: "完整视频.mp4",
        sha256: await sha256File(outputPath),
        width: outputMedia.video.width,
        height: outputMedia.video.height,
        aspectRatio: profile.aspectRatio,
        quality: profile.quality,
        durationSeconds: outputMedia.durationSeconds,
        shotCount: sources.length,
        audioPolicy: canCopyEveryAudio ? "compatible-source-audio-packet-copy" : "normalized-aac-32000hz-stereo",
        stagedAudioSha256,
        mergedAudioSha256,
        dialogueGate: "对白验收-火山ASR.json",
        visualGate: "H3视觉验收.json",
        stagingPath: path.relative(root, stagingDir),
        sources: sources.map(({ shotId, folder, jobId, sha256 }) => ({ shotId, folder, jobId, sha256 })),
    };
    await atomicJson(path.join(outputDir, "当前完整视频.json"), pointer);
    await atomicJson(path.join(outputDir, "安全合片验收.json"), { schemaVersion: 1, status: "pass", checkedAt: new Date().toISOString(), output: pointer });
    return { ...pointer, outputPath };
}

function verifyGates({ dialogueReport, visualReport, sources }) {
    if (dialogueReport.summary?.verdict !== "pass") throw new Error("火山 ASR 对白验收未通过，拒绝合片");
    if (visualReport.status !== "pass") throw new Error("H3 三帧视觉验收未通过，拒绝合片");
    const missingVisualChecks = requiredVisualChecks.filter((item) => !visualReport.review?.checks?.includes(item));
    if (missingVisualChecks.length) throw new Error(`H3 三帧视觉验收缺少硬检查项：${missingVisualChecks.join(", ")}`);
    for (const source of sources) {
        const dialogue = dialogueReport.shots?.find((item) => item.shotId === source.shotId || item.folder === source.folder);
        const visual = visualReport.shots?.find((item) => item.shotId === source.shotId || item.folder === source.folder);
        if (!dialogue || dialogue.verdict !== "pass" || dialogue.sourceSha256 !== source.sha256) throw new Error(`${source.folder} 对白验收缺失、失败或已过期`);
        if (!visual || visual.sourceSha256 !== source.sha256) throw new Error(`${source.folder} 三帧视觉验收缺失或已过期`);
        if (visual.storySegmentId !== source.storySegmentId || visual.sceneId !== source.sceneId) throw new Error(`${source.folder} 三帧视觉验收的故事场景绑定已过期`);
        if (JSON.stringify((visual.sceneReferences || []).map((item) => item.imageSha256).sort()) !== JSON.stringify([...source.sceneReferenceSha256].sort())) throw new Error(`${source.folder} 三帧视觉验收的场景参考图已过期`);
        if ((visual.continuity?.type || "independent") !== (source.continuity?.type || "independent") || (visual.continuity?.dependsOnShotId ?? null) !== (source.continuity?.dependsOnShotId ?? null)) throw new Error(`${source.folder} 三帧视觉验收的连续性依赖已过期`);
    }
}

async function readGate(filePath, label) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") throw new Error(`缺少${label}报告，拒绝合片`); throw error; } }
async function optionalJson(filePath) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function archiveExisting(outputDir, outputPath) { try { await stat(outputPath); } catch (error) { if (error.code === "ENOENT") return; throw error; } const archiveDir = path.join(outputDir, "历史版本", `安全合片替换-${new Date().toISOString().replace(/[-:.]/gu, "")}`); await mkdir(archiveDir, { recursive: true }); await rename(outputPath, path.join(archiveDir, path.basename(outputPath))); const pointerPath = path.join(outputDir, "当前完整视频.json"); try { await rename(pointerPath, path.join(archiveDir, "当前完整视频.json")); } catch (error) { if (error.code !== "ENOENT") throw error; } }
async function probeMedia(command, inputPath) { const raw = await captureCommand(command, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,time_base,sample_rate,channels:format=duration", "-of", "json", inputPath]); const data = JSON.parse(raw); return { video: data.streams?.find((item) => item.codec_type === "video") || null, audio: data.streams?.find((item) => item.codec_type === "audio") || null, durationSeconds: Number(data.format?.duration || 0) }; }
async function hashDecodedAudio(command, inputArgs) { return new Promise((resolve, reject) => { const hash = createHash("sha256"); let error = ""; const child = spawn(command, ["-hide_banner", "-loglevel", "error", ...inputArgs, "-map", "0:a:0", "-ac", "2", "-ar", "32000", "-c:a", "pcm_s16le", "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", (chunk) => hash.update(chunk)); child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(hash.digest("hex")) : reject(new Error(`音频哈希计算失败：${error.trim()}`))); }); }
async function sha256File(filePath) { return createHash("sha256").update(await readFile(filePath)).digest("hex"); }
function safeProjectPath(projectDir, base, value) { const resolved = path.resolve(base, String(value || "")); if (resolved !== projectDir && !resolved.startsWith(`${projectDir}${path.sep}`)) throw new Error("当前视频路径超出项目目录"); return resolved; }
function escapeConcatPath(value) { return value.replace(/\\/gu, "\\\\").replace(/'/gu, "'\\''"); }
async function atomicJson(target, value) { const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, target); }
async function runCommand(command, args, dependencies) { if (dependencies.run) return dependencies.run(command, args); await new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: "inherit" }); child.once("error", (error) => reject(error.code === "ENOENT" ? new Error(`找不到 FFmpeg：${command}`) : error)); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`FFmpeg 失败（${signal ? `signal ${signal}` : `exit ${code}`}）`))); }); }
async function captureCommand(command, args) { return new Promise((resolve, reject) => { let output = "", error = ""; const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} 失败：${error.trim()}`))); }); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const index = process.argv.indexOf("--project");
        if (index < 0 || !process.argv[index + 1]) throw new Error("缺少 --project");
        process.loadEnvFile(envPath);
        console.log(JSON.stringify(await mergeProjectShots({ projectDir: process.argv[index + 1], ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg", ffprobePath: "ffprobe" }), null, 2));
    } catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}
