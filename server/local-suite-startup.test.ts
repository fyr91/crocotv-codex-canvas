import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("root dev aliases always start the complete local suite", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.match(manifest.scripts.dev, /npm:dev:server/);
  assert.match(manifest.scripts.dev, /npm:dev:canvas/);
  assert.match(manifest.scripts.dev, /npm:dev:studio/);
  assert.equal(manifest.scripts["dev:web"], "npm run dev");
  assert.equal(manifest.scripts["dev:canvas"], "npm --prefix web run dev");
});

test("automatic launchers treat Studio as a required service", async () => {
  const [mcp, skill] = await Promise.all([
    readFile(new URL("plugins/croco-video-factory/mcp/server.ts", root), "utf8"),
    readFile(new URL("plugins/croco-video-factory/skills/croco-video-factory/scripts/%E5%85%AC%E5%85%B1/%E5%90%AF%E5%8A%A8%E6%9C%AC%E5%9C%B0Canvas.mjs", root), "utf8"),
  ]);
  for (const source of [mcp, skill]) {
    assert.match(source, /status\.api && status\.web && status\.studio|initial\.api && initial\.web && initial\.studio/);
    assert.match(source, /"dev:server"/);
    assert.match(source, /"dev:canvas"/);
    assert.match(source, /"dev:studio"/);
    assert.match(source, /AbortSignal\.timeout\(10_000\)/);
  }
});
