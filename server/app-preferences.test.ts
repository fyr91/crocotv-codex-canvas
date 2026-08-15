import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let preferences: typeof import("./app-preferences");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-app-preferences-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  preferences = await import("./app-preferences");
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("theme preference initializes once and then updates globally", async () => {
  assert.deepEqual(await preferences.readAppThemePreference(), { theme: null, updatedAt: null });

  const initialized = await preferences.updateAppThemePreference("light", true);
  assert.equal(initialized.theme, "light");

  const preserved = await preferences.updateAppThemePreference("dark", true);
  assert.equal(preserved.theme, "light");

  const updated = await preferences.updateAppThemePreference("dark");
  assert.equal(updated.theme, "dark");
  assert.equal((await preferences.readAppThemePreference()).theme, "dark");
});

test("theme preference rejects unsupported values", () => {
  assert.throws(() => preferences.parseAppTheme("system"), /light 或 dark/);
});
