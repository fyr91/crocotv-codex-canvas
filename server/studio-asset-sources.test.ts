import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let storage: typeof import("./storage");
let commands: typeof import("./studio-commands");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-studio-asset-sources-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  storage = await import("./storage");
  commands = await import("./studio-commands");
  await storage.ensureStorage();
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("Studio assets are grouped by series, standalone project, and episode without filtering Canvas resources", async () => {
  const series = await commands.createStudioProject({ title: "系列甲", text: "", workflow_mode: "r2v" });
  await commands.mutateStudioProject(series.id, (state) => ({
    ...state,
    projectKind: "series",
    characters: [{ id: "series-character", name: "系列角色", description: "系列级角色" }],
  }));

  const standalone = await commands.createStudioProject({ title: "独立项目", text: "", workflow_mode: "r2v" });
  await commands.mutateStudioProject(standalone.id, (state) => ({
    ...state,
    scenes: [{ id: "project-scene", name: "独立场景", description: "项目级场景" }],
  }));

  const episode = await commands.createStudioProject({ title: "第一集", text: "", workflow_mode: "r2v", series_id: series.id, episode_number: 1 });
  await commands.mutateStudioProject(episode.id, (state) => ({
    ...state,
    props: [{ id: "episode-prop", name: "剧集道具", description: "剧集级道具" }],
  }));

  const playground = await commands.createStudioProject({ title: "创作台", text: "", workflow_mode: "r2v" });
  await commands.mutateStudioProject(playground.id, (state) => ({
    ...state,
    projectKind: "playground",
    characters: [{ id: "playground-character", name: "不应出现", description: "" }],
  }));

  const stored = await storage.writeGenerated("canvas", "png", Uint8Array.from([137, 80, 78, 71]));
  await storage.addResource({
    id: stored.id,
    name: "Canvas 全量资源.png",
    type: "image",
    mimeType: "image/png",
    size: 4,
    fileName: stored.fileName,
    createdAt: new Date().toISOString(),
    source: "canvas",
  });

  const sources = await commands.listStudioAssetSources();
  assert.deepEqual(sources.map((source) => source.source_kind), ["series", "project", "episode"]);
  assert.deepEqual(sources.map((source) => source.source_id), [series.id, standalone.id, episode.id]);
  assert.equal(sources[0]?.characters[0]?.id, "series-character");
  assert.equal(sources[1]?.scenes[0]?.id, "project-scene");
  assert.equal(sources[2]?.props[0]?.id, "episode-prop");
  assert.equal(sources[2]?.series_id, series.id);
  assert.equal(sources[2]?.episode_number, 1);
  assert.equal(sources.some((source) => source.title === "创作台"), false);
  assert.equal((await storage.listResources()).some((resource) => resource.id === stored.id), true);
});

test("generated providers create their resource directory lazily", async () => {
  const stored = await storage.writeGenerated("minimax-music3", "mp3", Uint8Array.from([73, 68, 51]));
  assert.deepEqual([...await readFile(stored.target)], [73, 68, 51]);
});
