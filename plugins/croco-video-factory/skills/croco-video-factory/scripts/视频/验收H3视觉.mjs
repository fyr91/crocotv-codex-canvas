#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { h3ProfileForAspect } from "../公共/h3-client.mjs";
import { parseArgs } from "../音频/火山ASR.mjs";

export const requiredVisualChecks = ["no-readable-text", "no-storyboard-marks", "style-consistent", "character-consistent", "clean-realistic-scenes", "scene-reference-consistent", "cross-shot-continuity"];

export async function createVisualReview({ projectDir, ffmpegPath = "ffmpeg", ffprobePath = "ffprobe" } = {}) {
    const root = path.resolve(String(projectDir || ""));
    if (!projectDir) throw new Error("缺少 --project");
    const plan = JSON.parse(await readFile(path.join(root, "分镜", "分镜计划.json"), "utf8"));
    const profile = h3ProfileForAspect(plan.aspectRatio);
    const reviewCell = profile.width < profile.height ? { width: 240, height: 432 } : { width: 432, height: 240 };
    const sources = await currentSources(root);
    const runId = `${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${randomUUID().slice(0, 8)}`;
    const reviewDir = path.join(root, "成片", "H3视觉验收", runId);
    const framesDir = path.join(reviewDir, "三帧");
    await mkdir(framesDir, { recursive: true });
    let frameNumber = 1;
    const shots = [];
    for (const source of sources) {
        const duration = await probeDuration(ffprobePath, source.videoPath);
        const timestamps = [Math.min(0.25, duration * 0.1), duration * 0.5, Math.max(0, duration - Math.min(0.3, duration * 0.1))];
        const frames = [];
        for (const [position, timestamp] of timestamps.entries()) {
            const name = `${String(frameNumber).padStart(4, "0")}.jpg`;
            const outputPath = path.join(framesDir, name);
            await runCommand(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-ss", timestamp.toFixed(3), "-i", source.videoPath, "-frames:v", "1", "-vf", `scale=${reviewCell.width}:${reviewCell.height}:force_original_aspect_ratio=decrease,pad=${reviewCell.width}:${reviewCell.height}:(ow-iw)/2:(oh-ih)/2:white`, "-q:v", "2", outputPath]);
            frames.push({ position: ["start", "middle", "end"][position], timestampSeconds: Number(timestamp.toFixed(3)), path: path.relative(root, outputPath) });
            frameNumber++;
        }
        shots.push({ shotId: source.shotId, folder: source.folder, storySegmentId: source.storySegmentId, sceneIds: source.sceneIds, sceneId: source.sceneIds[0] || null, sceneDesignRequired: source.sceneDesignRequired, sceneReferences: source.sceneReferences, continuity: source.continuity, jobId: source.jobId, sourcePath: path.relative(root, source.videoPath), sourceSha256: source.sourceSha256, durationSeconds: duration, frames });
    }
    const contactSheetPath = path.join(reviewDir, "三帧总览.jpg");
    await runCommand(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-framerate", "1", "-start_number", "1", "-i", path.join(framesDir, "%04d.jpg"), "-frames:v", "1", "-vf", `tile=3x${shots.length}:padding=4:margin=4:color=white`, "-q:v", "2", contactSheetPath]);
    const report = {
        schemaVersion: 1,
        status: "manual-review-required",
        generatedAt: new Date().toISOString(),
        policy: "每个 H3 片段抽取首、中、尾三帧。必须实际查看总览图，确认无可读文字、无 Storyboard 箭头/批注/分格，色彩与整体风格统一，角色身份稳定，场景干净真实。还必须将每段与已验收场景设计图比较，并对每个连续对的前镜尾帧与后镜首帧检查空间、人物、服装、灯光、道具和动作承接。",
        requiredChecks: requiredVisualChecks,
        contactSheetPath: path.relative(root, contactSheetPath),
        contactSheetSha256: await sha256File(contactSheetPath),
        shots,
        sceneGroups: Object.values(Object.groupBy(shots.flatMap((shot) => shot.sceneIds.map((sceneId) => ({ sceneId, shot }))), (item) => item.sceneId)).map((items) => ({ sceneId: items[0].sceneId, shotIds: [...new Set(items.map((item) => item.shot.shotId))], referenceSha256: [...new Set(items.flatMap((item) => item.shot.sceneReferences.filter((reference) => reference.sceneId === item.sceneId).map((reference) => reference.imageSha256)))] })),
        continuityPairs: buildContinuityPairs(sources),
        review: null,
    };
    await atomicJson(path.join(reviewDir, "验收.json"), report);
    await atomicJson(path.join(root, "成片", "H3视觉验收.json"), report);
    return report;
}

export async function recordVisualReview({ projectDir, verdict, reviewer, checks = [], issues = [] } = {}) {
    const root = path.resolve(String(projectDir || ""));
    if (!projectDir) throw new Error("缺少 --project");
    const reportPath = path.join(root, "成片", "H3视觉验收.json");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (!reviewer) throw new Error("记录视觉验收时必须提供 --reviewer");
    if (!["pass", "fail"].includes(verdict)) throw new Error("--record 只能是 pass 或 fail");
    const current = await currentSources(root);
    for (const source of current) {
        const evidence = report.shots.find((item) => item.shotId === source.shotId);
        if (!evidence || evidence.sourceSha256 !== source.sourceSha256) throw new Error(`${source.folder} 在抽帧后已变更，必须重新生成三帧验收`);
    }
    const uniqueChecks = [...new Set(checks.map(String).filter(Boolean))];
    if (verdict === "pass") {
        const missing = requiredVisualChecks.filter((item) => !uniqueChecks.includes(item));
        if (missing.length) throw new Error(`视觉验收不完整，缺少 checks：${missing.join(", ")}`);
        if (issues.length) throw new Error("视觉验收 PASS 时不得同时记录 issues");
    } else if (!issues.length) throw new Error("视觉验收 FAIL 时必须通过 --issues 说明问题");
    const next = { ...report, status: verdict, reviewedAt: new Date().toISOString(), review: { reviewer: String(reviewer), checks: uniqueChecks, issues: issues.map(String) } };
    await atomicJson(reportPath, next);
    const runReportPath = path.join(root, path.dirname(report.contactSheetPath), "验收.json");
    await atomicJson(runReportPath, next);
    return next;
}

async function currentSources(root) {
    const plan = JSON.parse(await readFile(path.join(root, "分镜", "分镜计划.json"), "utf8"));
    if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error("分镜计划.json 没有 shots");
    const sources = [];
    for (const [index, shot] of plan.shots.entries()) {
        const folder = String(shot.folder || shot.directory || "");
        const shotId = String(shot.id ?? shot.shotId ?? index + 1).padStart(3, "0");
        const shotSceneIds = sceneIdsOf(shot);
        if (shot.sceneDesignRequired !== false && (!shotSceneIds.length || !shot.storySegmentId)) throw new Error(`${folder} 缺少 sceneIds 或 storySegmentId，不能进入视觉验收`);
        const videoDir = path.join(root, "分镜", folder, "视频生成");
        const pointer = JSON.parse(await readFile(path.join(videoDir, "当前视频.json"), "utf8"));
        if (pointer.status !== "succeeded") throw new Error(`${folder} 当前视频未成功`);
        const videoPath = safeProjectPath(root, videoDir, pointer.path);
        await stat(videoPath);
        const sceneFile = await optionalJson(path.join(root, "分镜", folder, "场景参考图.json"));
        const referencedSceneIds = new Set((sceneFile?.references || []).map((item) => String(item.sceneId || sceneFile?.sceneId || "")).filter(Boolean));
        if (shot.sceneDesignRequired !== false && (!(sceneFile?.references || []).length || shotSceneIds.some((sceneId) => !referencedSceneIds.has(sceneId)))) throw new Error(`${folder} 缺少与分镜计划 sceneIds 匹配的场景参考图`);
        const sceneReferences = [];
        for (const reference of sceneFile?.references || []) {
            const imagePath = safeProjectPath(root, path.join(root, "分镜", folder), reference.path);
            const imageSha256 = await sha256File(imagePath);
            if (reference.imageSha256 && reference.imageSha256 !== imageSha256) throw new Error(`${folder} 场景参考图哈希已失效`);
            sceneReferences.push({ sceneId: String(reference.sceneId || sceneFile?.sceneId || shotSceneIds[0] || ""), path: path.relative(root, imagePath), view: reference.view || null, imageSha256 });
        }
        sources.push({ shotId, folder, storySegmentId: shot.storySegmentId || null, sceneIds: shotSceneIds, sceneDesignRequired: shot.sceneDesignRequired !== false, sceneReferences, continuity: shot.continuity || { type: "independent" }, jobId: pointer.jobId || null, videoPath, sourceSha256: await sha256File(videoPath) });
    }
    return sources;
}

function buildContinuityPairs(sources) {
    const pairs = [];
    for (let index = 1; index < sources.length; index++) {
        const previous = sources[index - 1], current = sources[index];
        if (current.sceneIds.length && sameSceneIds(current, previous) && current.storySegmentId === previous.storySegmentId) pairs.push({ fromShotId: previous.shotId, toShotId: current.shotId, storySegmentId: current.storySegmentId, sceneIds: current.sceneIds, dependency: current.continuity });
    }
    return pairs;
}

async function optionalJson(filePath) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
function sceneIdsOf(shot) { const values = Array.isArray(shot?.sceneIds) ? shot.sceneIds : shot?.sceneId ? [shot.sceneId] : []; return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function sameSceneIds(left, right) { return JSON.stringify(sceneIdsOf(left)) === JSON.stringify(sceneIdsOf(right)); }

async function probeDuration(command, inputPath) { const output = await captureCommand(command, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inputPath]); const value = Number(output.trim()); if (!(value > 0)) throw new Error(`无法读取视频时长：${inputPath}`); return value; }
async function sha256File(filePath) { return createHash("sha256").update(await readFile(filePath)).digest("hex"); }
function safeProjectPath(projectDir, base, value) { const resolved = path.resolve(base, String(value || "")); if (resolved !== projectDir && !resolved.startsWith(`${projectDir}${path.sep}`)) throw new Error("视频路径超出项目目录"); return resolved; }
async function atomicJson(target, value) { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, target); }
async function runCommand(command, args) { await new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: "inherit" }); child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`命令失败：${command}（${signal || code}）`))); }); }
async function captureCommand(command, args) { return new Promise((resolve, reject) => { let output = "", error = ""; const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} 失败：${error.trim()}`))); }); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = parseArgs(process.argv.slice(2));
        let report;
        if (args.record) report = await recordVisualReview({ projectDir: args.project, verdict: String(args.record), reviewer: args.reviewer, checks: String(args.checks || "").split(",").map((item) => item.trim()).filter(Boolean), issues: String(args.issues || "").split("|").map((item) => item.trim()).filter(Boolean) });
        else report = await createVisualReview({ projectDir: args.project, ffmpegPath: args.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg", ffprobePath: args.ffprobe || "ffprobe" });
        process.stdout.write(`${JSON.stringify({ status: report.status, contactSheetPath: report.contactSheetPath })}\n`);
        if (report.status === "fail") process.exitCode = 2;
    } catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
}
