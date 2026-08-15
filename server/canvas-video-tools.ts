import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { addResource, dataDir, fileSize, readProject, resourceById, safeResourcePath, writeGenerated } from "./storage";

type Node = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; metadata?: Record<string, unknown> };
type Project = { id: string; version: number; nodes: Node[]; connections: Array<{ id: string; fromNodeId: string; toNodeId: string }> };
export type FrameRole = "first" | "middle" | "last";
const visualChecks = ["no-readable-text", "no-storyboard-marks", "style-consistent", "character-consistent", "clean-realistic-scenes", "scene-reference-consistent", "cross-shot-continuity"];

export async function useCanvasVideoFrames(input: { projectId: string; videoNodeId: string; frames?: FrameRole[]; frameTimes?: Partial<Record<FrameRole, number>>; targetNodeIds?: Partial<Record<FrameRole, string>>; replaceExisting?: boolean; originClientId: string }) {
  const project = asProject(await readProject(input.projectId));
  const video = requiredVideo(project, input.videoNodeId);
  const resource = await requiredNodeResource(video);
  const sourcePath = safeResourcePath(resource.fileName);
  const duration = await probeDuration(sourcePath);
  const shotLayout = shotLayoutMetadata(video);
  const roles = [...new Set((input.frames?.length ? input.frames : ["first", "middle", "last"]).filter((role): role is FrameRole => ["first", "middle", "last"].includes(role)))];
  if (!roles.length) throw new Error("至少选择一个视频帧位置");
  const created: Array<{ role: FrameRole; nodeId: string; resourceId: string; time: number }> = [];
  const operations: CanvasOperation[] = [];
  for (const [index, role] of roles.entries()) {
    const requestedTime = Number(input.frameTimes?.[role]);
    const time = Number.isFinite(requestedTime) ? Math.max(0, Math.min(duration, requestedTime)) : frameTime(role, duration);
    const temporary = path.join(dataDir, "runtime", "video-frames", `${randomUUID()}.jpg`);
    await mkdir(path.dirname(temporary), { recursive: true });
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", time.toFixed(3), "-i", sourcePath, "-frames:v", "1", "-q:v", "2", temporary]);
    const bytes = await readFile(temporary);
    await unlink(temporary).catch(() => undefined);
    const stored = await writeGenerated("canvas", "jpg", bytes);
    const frameResource = await addResource({
      id: stored.id,
      name: `${video.title}-${frameLabel(role)}.jpg`,
      type: "image",
      mimeType: "image/jpeg",
      size: await fileSize(stored.target),
      fileName: stored.fileName,
      createdAt: new Date().toISOString(),
      source: "canvas",
      metadata: { artifactType: "video-validation-frame", frameRole: role, frameTime: time, sourceVideoNodeId: video.id, sourceVideoStorageKey: resource.id },
    });
    const targetNodeId = String(input.targetNodeIds?.[role] || "");
    const existing = targetNodeId
      ? project.nodes.find((node) => node.id === targetNodeId && node.type === "image")
      : input.replaceExisting === false
        ? undefined
        : project.nodes.find((node) => node.type === "image" && node.metadata?.artifactType === "video-validation-frame" && node.metadata?.sourceVideoNodeId === video.id && node.metadata?.frameRole === role);
    if (targetNodeId && !existing) throw new Error(`目标图片节点不存在：${targetNodeId}`);
    const nodeId = existing?.id || randomUUID();
    const metadata = { content: frameResource.url, storageKey: frameResource.id, mimeType: frameResource.mimeType, bytes: frameResource.size, status: "success", generationState: "ready", artifactType: "video-validation-frame", frameRole: role, frameTime: time, sourceVideoNodeId: video.id, sourceVideoStorageKey: resource.id, ...shotLayout.child(80 + index) };
    if (existing) operations.push({ op: "update_node", nodeId, patch: { title: `${video.title} · ${frameLabel(role)}`, metadata } });
    else operations.push({ op: "add_node", node: { id: nodeId, type: "image", title: `${video.title} · ${frameLabel(role)}`, position: { x: video.position.x + video.width + 96, y: video.position.y + index * 356 }, width: 360, height: 320, metadata } });
    operations.push({ op: "connect", from: video.id, to: nodeId });
    created.push({ role, nodeId, resourceId: frameResource.id, time });
  }
  if (shotLayout.factoryRunId) operations.push({ op: "layout_shot_columns", factoryRunId: shotLayout.factoryRunId, preserveManualLayout: true });
  const result = await applyCanvasOperations(input.projectId, operations, undefined, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, videoNodeId: video.id, duration, frames: created, projectVersion: result.project.version };
}

export async function recordCanvasVisualReview(input: { projectId: string; videoNodeId: string; verdict: "pass" | "fail"; reviewer: string; checks?: string[]; issues?: string[]; originClientId: string }) {
  const project = asProject(await readProject(input.projectId));
  const video = requiredVideo(project, input.videoNodeId);
  const currentStorageKey = String(video.metadata?.storageKey || "");
  const shotLayout = shotLayoutMetadata(video);
  const frames = project.nodes.filter((node) => node.type === "image" && node.metadata?.artifactType === "video-validation-frame" && node.metadata?.sourceVideoNodeId === video.id && node.metadata?.sourceVideoStorageKey === currentStorageKey);
  const roles = new Set(frames.map((node) => node.metadata?.frameRole));
  const missingRoles = (["first", "middle", "last"] as FrameRole[]).filter((role) => !roles.has(role));
  if (missingRoles.length) throw new Error(`视觉验收缺少视频帧：${missingRoles.join(", ")}`);
  const checks = [...new Set((input.checks || []).map(String).filter(Boolean))];
  const issues = (input.issues || []).map(String).filter(Boolean);
  if (input.verdict === "pass") {
    const missingChecks = visualChecks.filter((check) => !checks.includes(check));
    if (missingChecks.length) throw new Error(`视觉验收缺少检查项：${missingChecks.join(", ")}`);
    if (issues.length) throw new Error("视觉验收通过时不能同时记录问题");
  } else if (!issues.length) throw new Error("视觉验收失败时必须说明问题");
  const existing = project.nodes.find((node) => node.type === "comment" && node.metadata?.artifactType === "h3-visual-verification" && node.metadata?.sourceVideoNodeId === video.id);
  const nodeId = existing?.id || randomUUID();
  const content = [`## H3 视觉验收${input.verdict === "pass" ? "通过" : "未通过"}`, "", `- **状态**：${input.verdict}`, `- **审核者**：${input.reviewer}`, `- **检查项**：${checks.join("、") || "无"}`, "", "### 首、中、尾帧", ...frames.sort((a, b) => String(a.metadata?.frameRole).localeCompare(String(b.metadata?.frameRole))).map((node) => `- ${node.metadata?.frameRole}: ${node.title}（${Number(node.metadata?.frameTime || 0).toFixed(3)}s）`), ...(issues.length ? ["", "### 问题", ...issues.map((issue) => `- ${issue}`)] : [])].join("\n");
  const metadata = { artifactType: "h3-visual-verification", sourceVideoNodeId: video.id, sourceVideoStorageKey: currentStorageKey, frameNodeIds: frames.map((node) => node.id), verdict: input.verdict, passed: input.verdict === "pass", reviewer: input.reviewer, checks, issues, content, status: "success", commentColor: "green", ...shotLayout.child(90) };
  const operation: CanvasOperation = existing
    ? { op: "update_node", nodeId, patch: { title: `视觉验收 · ${video.title}`, metadata } }
    : { op: "add_node", node: { id: nodeId, type: "comment", title: `视觉验收 · ${video.title}`, position: { x: video.position.x + video.width + 500, y: video.position.y }, width: 420, height: 360, metadata } };
  const operations: CanvasOperation[] = [operation];
  if (shotLayout.factoryRunId) operations.push({ op: "layout_shot_columns", factoryRunId: shotLayout.factoryRunId, preserveManualLayout: true });
  const result = await applyCanvasOperations(input.projectId, operations, undefined, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, videoNodeId: video.id, resultNodeId: nodeId, verdict: input.verdict, projectVersion: result.project.version };
}

export async function mergeCanvasVideos(input: { projectId: string; videoNodeIds: string[]; title?: string; requireVerification?: boolean; bgmResourceId?: string; dialogueVolume?: number; bgmVolume?: number; originClientId: string }) {
  const project = asProject(await readProject(input.projectId));
  const ids = [...new Set(input.videoNodeIds.map(String).filter(Boolean))];
  if (ids.length < 2) throw new Error("合片至少需要两个视频节点");
  const videos = ids.map((id) => requiredVideo(project, id));
  if (input.requireVerification !== false) for (const video of videos) {
    const key = String(video.metadata?.storageKey || "");
    const asr = project.nodes.find((node) => node.metadata?.artifactType === "volcano-asr-verification" && node.metadata?.sourceVideoNodeId === video.id && node.metadata?.passed === true);
    const visual = project.nodes.find((node) => node.metadata?.artifactType === "h3-visual-verification" && node.metadata?.sourceVideoNodeId === video.id && node.metadata?.sourceVideoStorageKey === key && node.metadata?.passed === true);
    if (!asr || !visual) throw new Error(`视频 ${video.id} 缺少有效的 ASR 或视觉验收通过记录`);
  }
  const resources = await Promise.all(videos.map(requiredNodeResource));
  const paths = resources.map((resource) => safeResourcePath(resource.fileName));
  const sourceSha256 = await Promise.all(paths.map(sha256File));
  const specs = await Promise.all(paths.map(probeVideo));
  const first = specs[0];
  if (specs.some((spec) => spec.width !== first.width || spec.height !== first.height)) throw new Error("待合并视频尺寸不一致，拒绝通过后期裁切或补边合片");
  const work = path.join(dataDir, "runtime", "video-merge", randomUUID());
  await mkdir(work, { recursive: true });
  const staged: string[] = [];
  for (const [index, source] of paths.entries()) {
    const target = path.join(work, `${String(index + 1).padStart(3, "0")}.mp4`);
    const spec = specs[index];
    const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", source];
    if (!spec.hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=32000:cl=stereo");
    args.push("-map", "0:v:0", "-map", spec.hasAudio ? "0:a:0" : "1:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "32000", "-ac", "2", "-b:a", "128k", ...(spec.hasAudio ? [] : ["-shortest"]), "-movflags", "+faststart", target);
    await run("ffmpeg", args);
    staged.push(target);
  }
  const concat = path.join(work, "concat.txt");
  await writeFile(concat, `${staged.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join("\n")}\n`, "utf8");
  const output = path.join(work, "merged.mp4");
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", output]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
  const [stagedAudioSha256, mergedAudioSha256] = await Promise.all([
    hashAudioPackets(["-f", "concat", "-safe", "0", "-i", concat]),
    hashAudioPackets(["-i", output]),
  ]);
  if (stagedAudioSha256 !== mergedAudioSha256) throw new Error("安全合片失败：拼接前后 PCM 音频哈希不一致，拒绝保存");
  let finalOutput = output;
  let bgmMetadata: Record<string, unknown> = {};
  if (input.bgmResourceId) {
    const bgm = await resourceById(input.bgmResourceId);
    if (!bgm || bgm.type !== "audio") throw new Error("所选 BGM 不是可用的本地音频资源");
    const mixed = path.join(work, "mixed.mp4");
    const dialogueVolume = normalizedVolume(input.dialogueVolume, 1);
    const bgmVolume = normalizedVolume(input.bgmVolume, 0.35);
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", output, "-stream_loop", "-1", "-i", safeResourcePath(bgm.fileName), "-filter_complex", `[0:a]volume=${dialogueVolume.toFixed(3)}[dialogue];[1:a]volume=${bgmVolume.toFixed(3)}[bgm];[dialogue][bgm]amix=inputs=2:duration=first:dropout_transition=2[mixed]`, "-map", "0:v:0", "-map", "[mixed]", "-c:v", "copy", "-c:a", "aac", "-ar", "32000", "-ac", "2", "-b:a", "128k", "-shortest", "-movflags", "+faststart", mixed]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", mixed, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
    finalOutput = mixed;
    bgmMetadata = { bgmResourceId: bgm.id, dialogueVolume, bgmVolume };
  }
  const stored = await writeGenerated("canvas", "mp4", await readFile(finalOutput));
  const resource = await addResource({ id: stored.id, name: `${input.title || "完整视频"}.mp4`, type: "video", mimeType: "video/mp4", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "canvas", metadata: { artifactType: "merged-video", sourceVideoNodeIds: ids, sourceVideoSha256: sourceSha256, stagedAudioSha256, mergedAudioSha256, width: first.width, height: first.height, ...bgmMetadata } });
  const nodeId = randomUUID();
  const right = Math.max(...videos.map((video) => video.position.x + video.width));
  const operations: CanvasOperation[] = [{ op: "add_node", node: { id: nodeId, type: "video", title: input.title || "完整视频", position: { x: right + 128, y: Math.min(...videos.map((video) => video.position.y)) }, width: 400, height: 300, metadata: { content: resource.url, storageKey: resource.id, mimeType: resource.mimeType, bytes: resource.size, status: "success", generationState: "ready", artifactType: "merged-video", sourceVideoNodeIds: ids, sourceVideoSha256: sourceSha256, stagedAudioSha256, mergedAudioSha256, ...bgmMetadata } } }, ...ids.map((id): CanvasOperation => ({ op: "connect", from: id, to: nodeId }))];
  const result = await applyCanvasOperations(input.projectId, operations, undefined, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, nodeId, resourceId: resource.id, sourceVideoNodeIds: ids, projectVersion: result.project.version };
}

export async function dubCanvasVideo(input: { projectId: string; videoNodeId: string; audioNodeId: string; offsetMs?: number; title?: string; targetNodeId?: string; originClientId: string }) {
  const project = asProject(await readProject(input.projectId));
  const video = requiredVideo(project, input.videoNodeId);
  const audio = project.nodes.find((node) => node.id === input.audioNodeId);
  if (!audio || audio.type !== "audio") throw new Error(`音频节点不存在：${input.audioNodeId}`);
  const [videoResource, audioResource] = await Promise.all([requiredNodeResource(video), requiredNodeResource(audio)]);
  const videoPath = safeResourcePath(videoResource.fileName);
  const audioPath = safeResourcePath(audioResource.fileName);
  const work = path.join(dataDir, "runtime", "video-dub", randomUUID());
  await mkdir(work, { recursive: true });
  const output = path.join(work, "dubbed.mp4");
  const offsetSeconds = Math.max(-60, Math.min(60, Number(input.offsetMs || 0) / 1000));
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath];
  if (offsetSeconds >= 0) args.push("-itsoffset", offsetSeconds.toFixed(3), "-i", audioPath);
  else args.push("-ss", Math.abs(offsetSeconds).toFixed(3), "-i", audioPath);
  args.push("-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-ar", "32000", "-ac", "2", "-b:a", "128k", "-shortest", "-movflags", "+faststart", output);
  await run("ffmpeg", args);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
  const stored = await writeGenerated("canvas", "mp4", await readFile(output));
  const resource = await addResource({
    id: stored.id,
    name: `${input.title || `${video.title} · 配音`}.mp4`,
    type: "video",
    mimeType: "video/mp4",
    size: await fileSize(stored.target),
    fileName: stored.fileName,
    createdAt: new Date().toISOString(),
    source: "canvas",
    metadata: { artifactType: "studio-dubbed-video", sourceVideoNodeId: video.id, sourceAudioNodeId: audio.id, offsetMs: Math.round(offsetSeconds * 1000) },
  });
  const nodeId = String(input.targetNodeId || randomUUID());
  const metadata = { content: resource.url, storageKey: resource.id, mimeType: resource.mimeType, bytes: resource.size, status: "success", generationState: "ready", artifactType: "studio-dubbed-video", sourceVideoNodeId: video.id, sourceAudioNodeId: audio.id, offsetMs: Math.round(offsetSeconds * 1000) };
  const existing = project.nodes.find((node) => node.id === nodeId);
  const operation: CanvasOperation = existing
    ? { op: "update_node", nodeId, patch: { title: input.title || `${video.title} · 配音`, metadata } }
    : { op: "add_node", node: { id: nodeId, type: "video", title: input.title || `${video.title} · 配音`, position: { x: video.position.x + video.width + 96, y: video.position.y }, width: 400, height: 300, metadata } };
  const result = await applyCanvasOperations(input.projectId, [operation, { op: "connect", from: video.id, to: nodeId }, { op: "connect", from: audio.id, to: nodeId }], undefined, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, nodeId, resourceId: resource.id, url: resource.url, offsetMs: Math.round(offsetSeconds * 1000), projectVersion: result.project.version };
}

function asProject(value: unknown) { const project = value as Project; if (!Array.isArray(project?.nodes) || !Array.isArray(project?.connections)) throw new Error("画布数据结构无效"); return project; }
function requiredVideo(project: Project, id: string) { const node = project.nodes.find((item) => item.id === id); if (!node) throw new Error(`视频节点不存在：${id}`); if (node.type !== "video") throw new Error(`节点 ${id} 不是视频节点`); return node; }
async function requiredNodeResource(node: Node) { const id = String(node.metadata?.storageKey || ""); const resource = id ? await resourceById(id) : undefined; if (!resource) throw new Error(`节点 ${node.id} 没有可用的本地视频资源`); return resource; }
function frameLabel(role: FrameRole) { return role === "first" ? "视频首帧" : role === "middle" ? "视频中间帧" : "视频尾帧"; }
function shotLayoutMetadata(node: Node) {
  const factoryRunId = String(node.metadata?.factoryRunId || "");
  const groupId = String(node.metadata?.groupId || "");
  const shotId = String(node.metadata?.shotId || "");
  return { factoryRunId, child: (layoutOrder: number) => factoryRunId && groupId && shotId ? { factoryRunId, groupId, shotId, layoutManaged: true, layoutSection: "verification", layoutOrder } : {} };
}
function frameTime(role: FrameRole, duration: number) { if (role === "first") return Math.min(0.25, duration * 0.1); if (role === "middle") return duration * 0.5; return Math.max(0, duration - Math.min(0.3, duration * 0.1)); }
function normalizedVolume(value: unknown, fallback: number) { const numeric = Number(value); if (!Number.isFinite(numeric)) return fallback; return Math.max(0, Math.min(2, numeric > 2 ? numeric / 100 : numeric)); }
async function probeDuration(input: string) { const value = Number((await capture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input])).trim()); if (!(value > 0)) throw new Error("无法读取视频时长"); return value; }
async function probeVideo(input: string) { const raw = JSON.parse(await capture("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", input])); const video = raw.streams?.find((item: { codec_type?: string }) => item.codec_type === "video"); if (!video?.width || !video?.height) throw new Error("无法读取视频规格"); return { width: Number(video.width), height: Number(video.height), duration: Number(raw.format?.duration || 0), hasAudio: Boolean(raw.streams?.some((item: { codec_type?: string }) => item.codec_type === "audio")) }; }
async function run(command: string, args: string[]) { await new Promise<void>((resolve, reject) => { let error = ""; const child = spawn(process.env.FFMPEG_PATH && command === "ffmpeg" ? process.env.FFMPEG_PATH : command, args, { stdio: ["ignore", "ignore", "pipe"] }); child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} 失败：${error.trim().slice(-1000)}`))); }); }
async function hashAudioPackets(inputArgs: string[]) { const output = await capture(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", ...inputArgs, "-map", "0:a:0", "-c:a", "copy", "-f", "hash", "-hash", "sha256", "-"]); const match = output.match(/SHA256=([a-f0-9]{64})/i); if (!match) throw new Error("音频包哈希计算失败"); return match[1].toLowerCase(); }
async function sha256File(filePath: string) { return createHash("sha256").update(await readFile(filePath)).digest("hex"); }
async function capture(command: string, args: string[]) { return new Promise<string>((resolve, reject) => { let output = "", error = ""; const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} 失败：${error.trim()}`))); }); }
