import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let projectId = "";
let workflow: typeof import("./studio-workflow");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-character-binding-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  const storage = await import("./storage");
  const commands = await import("./studio-commands");
  workflow = await import("./studio-workflow");
  await storage.ensureStorage();
  await storage.addResources([{
    id: "bound-image",
    name: "Bound image",
    type: "image",
    mimeType: "image/png",
    size: 10,
    fileName: "characters/bound-image.png",
    createdAt: "2026-08-18T00:00:00.000Z",
    source: "character",
    metadata: { characterId: "system-character" },
  }]);
  const project = await commands.createStudioProject({ title: "Character binding", text: "小林", workflow_mode: "r2v" }, "test");
  projectId = project.id;
  await workflow.createStudioEntity(projectId, "character", {
    id: "bound-character",
    name: "小林",
    system_character_id: "system-character",
    reference_image_resource_id: "bound-image",
    image_url: "/files/by-id/bound-image",
  }, "test");
  await workflow.createStudioEntity(projectId, "character", {
    id: "local-image-character",
    name: "小鹿",
    system_character_id: "system-character",
    reference_image_resource_id: "bound-image",
    image_url: "/files/by-id/independent-generated-image",
  }, "test");
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("解绑角色时清除仍指向原绑定资源的图片", async () => {
  const updated = await workflow.bindStudioCharacterResources(projectId, "bound-character", {}, "test-unbind");
  const character = updated.characters.find((item: { id: string }) => item.id === "bound-character");

  assert.ok(character);
  assert.equal(character.system_character_id, undefined);
  assert.equal(character.reference_image_resource_id, undefined);
  assert.equal(character.image_url, undefined);
});

test("解绑角色时保留独立上传或生成的图片", async () => {
  const updated = await workflow.bindStudioCharacterResources(projectId, "local-image-character", {}, "test-unbind-local-image");
  const character = updated.characters.find((item: { id: string }) => item.id === "local-image-character");

  assert.ok(character);
  assert.equal(character.system_character_id, undefined);
  assert.equal(character.reference_image_resource_id, undefined);
  assert.equal(character.image_url, "/files/by-id/independent-generated-image");
});
