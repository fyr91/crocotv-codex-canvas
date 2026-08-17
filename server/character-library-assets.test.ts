import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testDataDir = await mkdtemp(path.join(os.tmpdir(), "croco-character-library-assets-"));
process.env.CROCO_DATA_DIR = testDataDir;

const characters = await import("./characters");

await mkdir(path.join(testDataDir, "resources", "characters"), { recursive: true });
await writeFile(path.join(testDataDir, "resources", "characters", "index.json"), JSON.stringify({
  characters: [{ id: "character-1", name: "Deer", chinese_name: "小林", tts_voice_id: "voice-1", directory: "小林" }],
}));
await writeFile(path.join(testDataDir, "resources", "index.json"), JSON.stringify([
  {
    id: "remote-image", name: "小林原图", type: "image", mimeType: "image/png", size: 1,
    fileName: "characters/小林/assets/avatar.png", url: "/files/by-id/remote-image",
    createdAt: "2026-08-17T00:00:00.000Z", source: "character",
    metadata: { characterId: "character-1", assetKey: "avatarUrl" },
  },
  {
    id: "local-image", name: "用户补充", type: "image", mimeType: "image/png", size: 1,
    fileName: "user/local.png", url: "/files/by-id/local-image",
    createdAt: "2026-08-17T00:00:01.000Z", source: "upload", metadata: {},
  },
  {
    id: "local-video", name: "用户视频", type: "video", mimeType: "video/mp4", size: 1,
    fileName: "user/local.mp4", url: "/files/by-id/local-video",
    createdAt: "2026-08-17T00:00:02.000Z", source: "upload", metadata: {},
  },
  {
    id: "local-audio", name: "用户音频", type: "audio", mimeType: "audio/mpeg", size: 1,
    fileName: "user/local.mp3", url: "/files/by-id/local-audio",
    createdAt: "2026-08-17T00:00:03.000Z", source: "upload", metadata: {},
  },
  {
    id: "local-file", name: "用户文档", type: "file", mimeType: "text/plain", size: 1,
    fileName: "user/local.txt", url: "/files/by-id/local-file",
    createdAt: "2026-08-17T00:00:04.000Z", source: "upload", metadata: {},
  },
]));

test.after(async () => {
  await rm(testDataDir, { recursive: true, force: true });
});

test("本地视频和音频可作为同一角色的补充资产", async () => {
  await characters.attachCharacterResources("character-1", ["local-video", "local-audio"], "upload");
  await characters.attachCharacterResources("character-1", ["local-video"], "agent");
  let resources = JSON.parse(await readFile(path.join(testDataDir, "resources", "index.json"), "utf8"));
  assert.deepEqual(resources.find((item: any) => item.id === "local-video").metadata.characterLibraryCharacterIds, ["character-1"]);
  assert.equal(resources.find((item: any) => item.id === "local-video").metadata.characterAssetOrigin, "upload");
  assert.deepEqual(resources.find((item: any) => item.id === "local-audio").metadata.characterLibraryCharacterIds, ["character-1"]);

  await characters.detachCharacterResource("character-1", "local-video");
  await characters.detachCharacterResource("character-1", "local-audio");
  resources = JSON.parse(await readFile(path.join(testDataDir, "resources", "index.json"), "utf8"));
  assert.equal(resources.find((item: any) => item.id === "local-video").metadata.characterLibraryCharacterIds, undefined);
  assert.equal(resources.find((item: any) => item.id === "local-audio").metadata.characterLibraryCharacterIds, undefined);
});

test("普通文件不能作为角色补充资产", async () => {
  await assert.rejects(
    characters.attachCharacterResources("character-1", ["local-file"], "upload"),
    /只支持图片、视频和音频/,
  );
});

test("本地图片可关联、设为主图并从角色解除关联", async () => {
  await characters.attachCharacterResources("character-1", ["local-image"], "upload");
  let resources = JSON.parse(await readFile(path.join(testDataDir, "resources", "index.json"), "utf8"));
  assert.deepEqual(resources.find((item: any) => item.id === "local-image").metadata.characterLibraryCharacterIds, ["character-1"]);

  await characters.setCharacterPrimaryImage("character-1", "local-image");
  assert.equal((await characters.listCharacters())[0].primaryResourceId, "local-image");

  await characters.detachCharacterResource("character-1", "local-image");
  resources = JSON.parse(await readFile(path.join(testDataDir, "resources", "index.json"), "utf8"));
  assert.equal(resources.find((item: any) => item.id === "local-image").metadata.characterLibraryCharacterIds, undefined);
  assert.equal((await characters.listCharacters())[0].primaryResourceId, undefined);
});

test("同步角色原始资产不可解除关联", async () => {
  await assert.rejects(
    characters.detachCharacterResource("character-1", "remote-image"),
    /同步角色原始资产不可移除/,
  );
});
