import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { findInstalledPlugin, migrateStandaloneSkills, parseDirtyEntries, restoreStandaloneSkills } from "./update-helpers.mjs";

test("parses git porcelain output without hiding dirty files", () => {
  assert.deepEqual(parseDirtyEntries(" M a.txt\n?? b.txt\n"), [" M a.txt", "?? b.txt"]);
});

test("finds only installed and enabled plugin entries", () => {
  const inventory = { installed: [
    { pluginId: "old@personal", installed: true, enabled: false },
    { pluginId: "new@croco", installed: true, enabled: true },
  ] };
  assert.equal(findInstalledPlugin(inventory, "old@personal"), null);
  assert.equal(findInstalledPlugin(inventory, "new@croco")?.pluginId, "new@croco");
});

test("moves standalone skills to a recoverable backup and restores them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "croco-update-"));
  const skillsRoot = path.join(root, "skills");
  const original = path.join(skillsRoot, "croco-video-factory");
  const backupRoot = path.join(root, "backup");
  await mkdir(original, { recursive: true });
  await writeFile(path.join(original, "SKILL.md"), "old copy\n");

  const moved = await migrateStandaloneSkills({ skillsRoot, skillNames: ["croco-video-factory"], backupRoot });
  assert.equal(moved.length, 1);
  assert.equal(await readFile(path.join(backupRoot, "skills", "croco-video-factory", "SKILL.md"), "utf8"), "old copy\n");

  await restoreStandaloneSkills(moved);
  assert.equal(await readFile(path.join(original, "SKILL.md"), "utf8"), "old copy\n");
});
