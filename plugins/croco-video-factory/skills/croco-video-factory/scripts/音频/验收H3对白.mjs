#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadAsrConfig, parseArgs, transcribeAudio } from "./火山ASR.mjs";

const numberMap = new Map([..."0123456789"].map((value, index) => [value, "零一二三四五六七八九"[index]]));

export function normalizeDialogue(value) {
    let text = String(value || "").normalize("NFKC");
    for (const [number, han] of numberMap) text = text.replaceAll(number, han);
    return text
        .replaceAll("两", "二")
        .replaceAll("闲功夫", "闲工夫")
        .replaceAll("呀", "啊")
        .replaceAll("哪儿", "哪")
        .replaceAll("这儿", "这")
        .replaceAll("那儿", "那")
        .replaceAll("一会儿", "一会")
        .replace(/[^\p{Script=Han}a-zA-Z]/gu, "")
        .toLowerCase();
}

export async function validateProjectDialogue({ projectDir, planPath = null, ffmpegPath = "ffmpeg", ffprobePath = "ffprobe", envPath = null, retryPasses = 3, transcriber = transcribeAudio } = {}) {
    const root = path.resolve(String(projectDir || ""));
    if (!projectDir) throw new Error("缺少 --project");
    const plan = JSON.parse(await readFile(path.join(root, "分镜", "分镜计划.json"), "utf8"));
    if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error("分镜计划.json 没有可验收的 shots");
    const dialoguePlanPath = planPath ? path.resolve(planPath) : await discoverDialoguePlan(root);
    const dialoguePlan = JSON.parse(await readFile(dialoguePlanPath, "utf8"));
    const tasks = Array.isArray(dialoguePlan) ? dialoguePlan : dialoguePlan.tasks;
    if (!Array.isArray(tasks)) throw new Error("对白计划必须是任务数组，或包含 tasks 数组");
    const byShot = new Map();
    for (const task of tasks) {
        const shotId = parseShotId(task.shot);
        if (!shotId) throw new Error(`无法从语音任务解析分镜编号：${task.shot}`);
        if (!byShot.has(shotId)) byShot.set(shotId, []);
        byShot.get(shotId).push(task);
    }
    const config = await loadAsrConfig({ envPath: envPath || path.join(process.cwd(), ".codex", ".env") });
    const shots = [];
    for (const [index, shot] of plan.shots.entries()) {
        const shotId = String(shot.id ?? shot.shotId ?? index + 1).padStart(3, "0");
        const folder = String(shot.folder || shot.directory || "");
        if (!folder) throw new Error(`分镜 ${shotId} 缺少 folder`);
        const videoDir = path.join(root, "分镜", folder, "视频生成");
        const pointer = JSON.parse(await readFile(path.join(videoDir, "当前视频.json"), "utf8"));
        if (pointer.status !== "succeeded") throw new Error(`${folder} 当前视频未成功，不能验收对白`);
        const videoPath = safeProjectPath(root, videoDir, pointer.path);
        await stat(videoPath);
        const sourceSha256 = await sha256File(videoPath);
        const evidenceDir = path.join(videoDir, "对白验收");
        await mkdir(evidenceDir, { recursive: true });
        const audioPath = path.join(evidenceDir, "音频.wav");
        const hasAudio = await probeHasAudio(ffprobePath, videoPath);
        if (hasAudio) await runCommand(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath]);
        const expectedTasks = byShot.get(shotId) || [];
        const expectedText = expectedTasks.map((task) => String(task.content || "")).join("");
        const expectedNormalized = normalizeDialogue(expectedText);
        const passes = [];
        if (hasAudio) {
            const maxPasses = Math.max(1, Math.min(5, Number(retryPasses) || 3));
            for (let pass = 1; pass <= maxPasses; pass++) {
                const result = await transcriber({ inputPath: audioPath, outputPath: path.join(evidenceDir, `火山ASR-第${String(pass).padStart(2, "0")}次.json`), config });
                passes.push(result);
                if (pass === 1 && normalizeDialogue(result.text) === expectedNormalized) break;
            }
        } else passes.push({ provider: "volcengine", engine: config.resourceId, durationMs: 0, text: "", utterances: [], noAudioStream: true });
        const exactPasses = passes.filter((item) => normalizeDialogue(item.text) === expectedNormalized);
        const requiredVotes = passes.length === 1 ? 1 : Math.floor(passes.length / 2) + 1;
        const verdict = exactPasses.length >= requiredVotes ? "pass" : "fail";
        const selected = exactPasses[0] || passes[0];
        const canonical = { ...selected, consensus: { attemptedPasses: passes.length, requiredVotes, exactVotes: exactPasses.length, expectedText, transcripts: passes.map((item) => item.text) }, sourceVideoSha256: sourceSha256 };
        await atomicJson(path.join(evidenceDir, "火山ASR.json"), canonical);
        shots.push({
            shotId,
            folder,
            jobId: pointer.jobId || null,
            sourcePath: path.relative(root, videoPath),
            sourceSha256,
            expected: expectedTasks.map((task) => ({ speaker: task.speaker || null, content: String(task.content || "") })),
            recognizedText: selected.text,
            durationMs: selected.durationMs,
            textComplete: verdict === "pass",
            noExtraDialogue: verdict === "pass",
            consensus: canonical.consensus,
            verdict,
            evidencePath: path.relative(root, path.join(evidenceDir, "火山ASR.json")),
        });
    }
    const summary = {
        checkedShots: shots.length,
        checkedDialogueLines: shots.reduce((total, shot) => total + shot.expected.length, 0),
        passedShots: shots.filter((shot) => shot.verdict === "pass").length,
        failedShots: shots.filter((shot) => shot.verdict === "fail").length,
        verdict: shots.every((shot) => shot.verdict === "pass") ? "pass" : "fail",
    };
    const report = {
        schemaVersion: 2,
        validationStage: "generated-h3-shot-files",
        provider: "volcengine",
        engine: config.resourceId,
        policy: "逐片段提取 16kHz 单声道 WAV 并调用火山录音文件极速版。首轮不匹配时自动执行三轮多数共识；必须与计划对白完整等价且无额外人声。",
        dialoguePlan: path.relative(root, dialoguePlanPath),
        shots,
        summary,
    };
    const outputDir = path.join(root, "成片");
    await mkdir(outputDir, { recursive: true });
    await atomicJson(path.join(outputDir, "对白验收-火山ASR.json"), report);
    await writeFile(path.join(outputDir, "对白验收-火山ASR.md"), renderMarkdown(report), "utf8");
    return report;
}

async function discoverDialoguePlan(root) {
    const candidates = [path.join(root, "配音", "角色对白计划.json"), path.join(root, "配音", "语音任务.json"), path.join(root, "语音任务.json")];
    for (const candidate of candidates) { try { await stat(candidate); return candidate; } catch (error) { if (error.code !== "ENOENT") throw error; } }
    throw new Error("找不到对白计划：请提供 --plan，或创建 配音/语音任务.json");
}

function parseShotId(value) {
    const match = String(value ?? "").match(/\d{1,3}/u);
    return match ? String(Number(match[0])).padStart(3, "0") : null;
}

function renderMarkdown(report) {
    const rows = report.shots.map((shot) => `| ${shot.shotId} | ${shot.expected.length} | ${shot.consensus.exactVotes}/${shot.consensus.attemptedPasses} | ${shot.verdict.toUpperCase()} | ${String(shot.recognizedText || "").replaceAll("|", "\\|")} |`).join("\n");
    return `# H3 对白验收（火山 ASR）\n\n- 分镜：${report.summary.checkedShots}\n- 对白：${report.summary.checkedDialogueLines} 句\n- 通过：${report.summary.passedShots}\n- 失败：${report.summary.failedShots}\n- 结论：${report.summary.verdict.toUpperCase()}\n\n| 分镜 | 计划句数 | 共识票 | 结论 | 识别文本 |\n|---|---:|---:|---|---|\n${rows}\n`;
}

async function probeHasAudio(command, inputPath) {
    const output = await captureCommand(command, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", inputPath]);
    const value = JSON.parse(output || "{}");
    return Array.isArray(value.streams) && value.streams.length > 0;
}

async function sha256File(filePath) { return createHash("sha256").update(await readFile(filePath)).digest("hex"); }
function safeProjectPath(projectDir, base, value) { const resolved = path.resolve(base, String(value || "")); if (resolved !== projectDir && !resolved.startsWith(`${projectDir}${path.sep}`)) throw new Error("视频路径超出项目目录"); return resolved; }
async function atomicJson(target, value) { const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, target); }
async function runCommand(command, args) { await new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: "inherit" }); child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`命令失败：${command}（${signal || code}）`))); }); }
async function captureCommand(command, args) { return new Promise((resolve, reject) => { let output = "", error = ""; const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} 失败：${error.trim()}`))); }); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = parseArgs(process.argv.slice(2));
        const report = await validateProjectDialogue({ projectDir: args.project, planPath: args.plan || null, ffmpegPath: args.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg", ffprobePath: args.ffprobe || "ffprobe", envPath: args.env ? path.resolve(args.env) : path.join(process.cwd(), ".codex", ".env"), retryPasses: Number(args.passes || 3) });
        process.stdout.write(`${JSON.stringify(report.summary)}\n`);
        if (report.summary.verdict !== "pass") process.exitCode = 2;
    } catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
}
