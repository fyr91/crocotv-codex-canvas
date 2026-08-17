#!/usr/bin/env node

const api = String(process.env.CROCO_MATRIX_API || "http://127.0.0.1:4499").replace(/\/$/, "");
const command = process.argv[2] || "";
const projectId = process.argv[3] || "";

const stage1Ids = [
  "matrix-ernie-square",
  "matrix-ernie-portrait",
  "matrix-ernie-landscape",
  "matrix-music-instrumental-mp3",
  "matrix-music-lyrics-wav",
  "matrix-h3-t2v-batch2",
  "matrix-ltx-t2v",
];

const stage2Ids = [
  "matrix-h3-t2v-portrait",
  "matrix-h3-i2v-first-frame",
  "matrix-h3-r2v-first-last",
  "matrix-h3-r2v-image-audio",
  "matrix-ltx-i2v-first-frame",
  "matrix-ltx-ingredients",
  "matrix-music-seed-max-safe",
];

const stage2InputIds = [
  "matrix-h3-i2v-first-frame",
  "matrix-h3-r2v-first-last",
  "matrix-h3-r2v-image-audio",
  "matrix-ltx-i2v-first-frame",
  "matrix-ltx-ingredients",
];

async function createMatrixProject() {
  const project = await request("/api/projects", {
    method: "POST",
    body: { title: `GPU V2 真实参数矩阵 · ${new Date().toISOString().slice(0, 16).replace("T", " ")}` },
  });
  const operations = [
    config("matrix-ernie-square", "ERNIE · 1024² · seed 0", 80, 80, {
      generationMode: "image", model: "ernie-image-turbo", composerContent: "一颗青葡萄放在纯白陶瓷盘中央，柔和棚拍光，细节清晰", size: "1024x1024", count: 1, imageSeed: 0,
    }),
    config("matrix-ernie-portrait", "ERNIE · 768×1376 · seed 17", 500, 80, {
      generationMode: "image", model: "ernie-image-turbo", composerContent: "竖幅童话绘本，一只小松鼠举着葡萄藤，晨光，绿色与金色", size: "768x1376", count: 1, imageSeed: 17,
    }),
    config("matrix-ernie-landscape", "ERNIE · 1376×768 · seed 2147483647", 920, 80, {
      generationMode: "image", model: "ernie-image-turbo", composerContent: "宽幅葡萄园日落，远山层叠，写实摄影，天空留白", size: "1376x768", count: 1, imageSeed: 2147483647,
    }),
    config("matrix-music-instrumental-mp3", "Music3 · 纯音乐 MP3 · seed 0", 80, 540, {
      generationMode: "music", model: "minimax-music-3", musicTitle: "葡萄晨光", musicDescription: "轻快木琴与原声吉他，儿童探索感，无人声", musicLyrics: "", musicInstrumental: true, musicStyles: ["Upbeat", "Folk"], musicMaxDuration: 2, musicSeed: 0, musicTiledDecode: false, musicOutputFormat: "mp3",
    }),
    config("matrix-music-lyrics-wav", "Music3 · 歌词 WAV · tiled", 500, 540, {
      generationMode: "music", model: "minimax-music-3", musicTitle: "葡萄排队歌", musicDescription: "明亮儿童流行，拍手节奏，女声清唱", musicLyrics: "[Verse]\n小葡萄排好队\n阳光下面闪闪亮", musicInstrumental: false, musicStyles: ["Pop", "Upbeat"], musicMaxDuration: 3, musicSeed: 17, musicTiledDecode: true, musicOutputFormat: "wav",
    }),
    config("matrix-h3-t2v-batch2", "H3 · T2V preview · batch 2", 920, 540, {
      generationMode: "video", model: "minimax-h3", composerContent: "A single green grape rolls slowly across a clean white table, locked camera, soft daylight.", seconds: 3, vquality: "preview", videoCount: 2, videoInputMode: "text", videoPromptEnhance: "false",
    }),
    config("matrix-ltx-t2v", "LTX · T2V · 512×320 · seed 0", 1340, 540, {
      generationMode: "video", model: "ltx-2.5", composerContent: "A paper grape gently rotates on a wooden desk, static camera.", seconds: 3, size: "512x320", videoCount: 1, videoInputMode: "text", videoPromptEnhance: "false", videoSeed: 0, videoReferenceStrength: 1,
    }),
  ];
  await request(`/api/canvas/projects/${project.id}/operations`, { method: "POST", body: { operations } });
  return { projectId: project.id, canvasUrl: `http://127.0.0.1:3021/canvas/${project.id}`, stage1Ids };
}

async function prepareStage2(id) {
  requiredProjectId(id);
  const project = await request(`/api/projects/${id}`);
  const outputs = new Map(project.nodes.filter((node) => node.metadata?.sourceConfigNodeId).map((node) => [node.metadata.sourceConfigNodeId, node]));
  const square = requiredOutput(outputs, "matrix-ernie-square");
  const portrait = requiredOutput(outputs, "matrix-ernie-portrait");
  const landscape = requiredOutput(outputs, "matrix-ernie-landscape");
  const audio = requiredOutput(outputs, "matrix-music-lyrics-wav");
  const operations = [
    config("matrix-h3-t2v-portrait", "H3 · T2V portrait_preview", 80, 1080, {
      generationMode: "video", model: "minimax-h3", composerContent: "A grape balloon rises against a pale morning sky, vertical composition, fixed camera.", seconds: 3, vquality: "portrait_preview", videoCount: 1, videoInputMode: "text", videoPromptEnhance: "false",
    }),
    config("matrix-h3-i2v-first-frame", "H3 · I2V first_frame", 500, 1080, {
      generationMode: "video", model: "minimax-h3", composerContent: `Use @[node:${square.id}] as the first frame. The subject makes one small natural movement while the original composition and identity remain unchanged.`, seconds: 3, vquality: "preview", videoCount: 1, videoInputMode: "firstFrame", videoPromptEnhance: "false",
    }),
    connect(square.id, "matrix-h3-i2v-first-frame"),
    config("matrix-h3-r2v-first-last", "H3 · R2V ordered first/last", 920, 1080, {
      generationMode: "video", model: "minimax-h3", composerContent: `Transition smoothly from @[node:${square.id}] to @[node:${portrait.id}]; preserve the subjects and avoid extra objects.`, seconds: 3, vquality: "preview", videoCount: 1, videoInputMode: "firstLastFrame", videoPromptEnhance: "false", resourceRoles: [{ resourceId: square.metadata.storageKey, type: "image", role: "exactFirstFrame" }, { resourceId: portrait.metadata.storageKey, type: "image", role: "exactLastFrame" }],
    }),
    connect(square.id, "matrix-h3-r2v-first-last"), connect(portrait.id, "matrix-h3-r2v-first-last"),
    config("matrix-h3-r2v-image-audio", "H3 · R2V image + audio", 1340, 1080, {
      generationMode: "video", model: "minimax-h3", composerContent: `Use @[node:${landscape.id}] as the visual identity and synchronize gentle motion to @[node:${audio.id}].`, seconds: 3, vquality: "standard_480p", videoCount: 1, videoInputMode: "multimodal", videoPromptEnhance: "false", resourceRoles: [{ resourceId: landscape.metadata.storageKey, type: "image", role: "referenceImage1" }, { resourceId: audio.metadata.storageKey, type: "audio", role: "audioReference1" }],
    }),
    connect(landscape.id, "matrix-h3-r2v-image-audio"), connect(audio.id, "matrix-h3-r2v-image-audio"),
    config("matrix-ltx-i2v-first-frame", "LTX · I2V · strength 0.1", 80, 1540, {
      generationMode: "video", model: "ltx-2.5", composerContent: `Use @[node:${square.id}] as the first frame. The grape moves slightly in a soft breeze while the composition stays stable.`, seconds: 3, size: "512x320", videoCount: 1, videoInputMode: "firstFrame", videoPromptEnhance: "false", videoSeed: 42, videoReferenceStrength: 0.1,
    }),
    connect(square.id, "matrix-ltx-i2v-first-frame"),
    config("matrix-ltx-ingredients", "LTX · Ingredients · strength 1.5", 500, 1540, {
      generationMode: "video", model: "ltx-2.5", composerContent: `Create a coherent short shot using @[node:${portrait.id}] as the exact visual ingredient.`, seconds: 3, size: "576x320", videoCount: 1, videoInputMode: "multimodal", videoPromptEnhance: "true", videoSeed: 73, videoReferenceStrength: 1.5,
    }),
    connect(portrait.id, "matrix-ltx-ingredients"),
    config("matrix-music-seed-max-safe", "Music3 · max safe seed · MP3", 920, 1540, {
      generationMode: "music", model: "minimax-music-3", musicTitle: "种子边界", musicDescription: "极简钟琴提示音，干净，短促", musicLyrics: "", musicInstrumental: true, musicStyles: ["Ambient"], musicMaxDuration: 1, musicSeed: Number.MAX_SAFE_INTEGER, musicTiledDecode: true, musicOutputFormat: "mp3",
    }),
  ];
  await request(`/api/canvas/projects/${id}/operations`, { method: "POST", body: { operations } });
  return { projectId: id, stage2Ids, references: { square: square.metadata.storageKey, portrait: portrait.metadata.storageKey, landscape: landscape.metadata.storageKey, audio: audio.metadata.storageKey } };
}

async function runStage(id, nodeIds) {
  requiredProjectId(id);
  const created = await request(`/api/canvas/projects/${id}/run-nodes`, { method: "POST", body: { nodeIds, concurrency: nodeIds.length, async: true } });
  const runJobId = String(created.jobId || created.id || "");
  if (!runJobId) throw new Error(`Canvas run response is missing jobId: ${JSON.stringify(created)}`);
  let job = created;
  while (!["completed", "failed", "cancelled", "succeeded", "canceled"].includes(String(job.status))) {
    await delay(3000);
    job = await request(`/api/canvas/run-jobs/${runJobId}`);
  }
  return { projectId: id, runJob: job, report: await report(id) };
}

async function runFlash(id) {
  requiredProjectId(id);
  const project = await request(`/api/projects/${id}`);
  const sources = ["matrix-h3-t2v-batch2", "matrix-h3-r2v-image-audio"].map((sourceConfigNodeId) => {
    const node = project.nodes.find((item) => item.type === "video" && item.metadata?.sourceConfigNodeId === sourceConfigNodeId && item.metadata?.storageKey);
    if (!node) throw new Error(`Missing H3 source output: ${sourceConfigNodeId}`);
    return { sourceConfigNodeId, resourceId: node.metadata.storageKey };
  });
  const created = await Promise.all(sources.map(async (source) => ({ ...source, enhancement: (await request("/api/gpu/enhancements", { method: "POST", body: { sourceResourceId: source.resourceId } })).enhancement })));
  const results = [];
  for (const item of created) {
    let enhancement = item.enhancement;
    while (!["succeeded", "failed", "canceled"].includes(String(enhancement.status))) {
      await delay(3000);
      enhancement = (await request(`/api/gpu/enhancements/${item.resourceId}`)).enhancement;
    }
    results.push({ ...item, enhancement });
  }
  return { projectId: id, results, report: await report(id) };
}

async function report(id) {
  requiredProjectId(id);
  const [project, resources] = await Promise.all([request(`/api/projects/${id}`), request("/api/resources")]);
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  return {
    projectId: id,
    title: project.title,
    version: project.version,
    configs: project.nodes.filter((node) => node.type === "config" && node.id.startsWith("matrix-")).map((node) => ({
      id: node.id,
      title: node.title,
      status: node.metadata?.generationState || node.metadata?.status,
      error: node.metadata?.errorDetails || null,
      outputs: project.nodes.filter((item) => item.metadata?.sourceConfigNodeId === node.id).map((item) => {
        const resource = resourceById.get(item.metadata?.storageKey);
        return { nodeId: item.id, type: item.type, resourceId: item.metadata?.storageKey || null, jobId: resource?.metadata?.jobId || null, mimeType: resource?.mimeType || item.metadata?.mimeType || null, bytes: resource?.size || item.metadata?.bytes || null, parameters: resource?.metadata || null };
      }),
    })),
  };
}

function config(id, title, x, y, metadata) {
  return { op: "add_node", node: { id, type: "config", title, position: { x, y }, width: 360, height: 360, metadata: { ...metadata, status: "idle", generationState: "ready", artifactType: "gpu-v2-e2e-matrix" } } };
}

function connect(from, to) { return { op: "connect", from, to, fromPort: "workflow-output", toPort: "workflow-input" }; }
function requiredOutput(outputs, id) { const output = outputs.get(id); if (!output?.metadata?.storageKey) throw new Error(`Missing completed output for ${id}`); return output; }
function requiredProjectId(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("A valid project ID is required"); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function request(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-croco-client-id": "gpu-v2-e2e-matrix", ...(init.headers || {}) },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

if (command === "create") console.log(JSON.stringify(await createMatrixProject(), null, 2));
else if (command === "run-stage1") console.log(JSON.stringify(await runStage(projectId, stage1Ids), null, 2));
else if (command === "prepare-stage2") console.log(JSON.stringify(await prepareStage2(projectId), null, 2));
else if (command === "run-stage2") console.log(JSON.stringify(await runStage(projectId, stage2Ids), null, 2));
else if (command === "run-stage2-inputs") console.log(JSON.stringify(await runStage(projectId, stage2InputIds), null, 2));
else if (command === "run-flash") console.log(JSON.stringify(await runFlash(projectId), null, 2));
else if (command === "report") console.log(JSON.stringify(await report(projectId), null, 2));
else throw new Error("Usage: run-gpu-e2e-matrix.mjs create|run-stage1|prepare-stage2|run-stage2|run-stage2-inputs|run-flash|report [project-id]");
