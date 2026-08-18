import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("资源索引并发新增和更新不会互相覆盖", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "croco-resource-concurrency-"));
  process.env.CROCO_DATA_DIR = temporary;
  const storage = await import("./storage");
  try {
    await storage.ensureStorage();
    const firstFile = await storage.writeGenerated("canvas", "bin", new Uint8Array([1]));
    const secondFile = await storage.writeGenerated("canvas", "bin", new Uint8Array([2]));
    const createdAt = new Date().toISOString();
    const resources = [
      { id: firstFile.id, name: "first.bin", type: "file" as const, mimeType: "application/octet-stream", size: 1, fileName: firstFile.fileName, createdAt, source: "canvas" as const },
      { id: secondFile.id, name: "second.bin", type: "file" as const, mimeType: "application/octet-stream", size: 1, fileName: secondFile.fileName, createdAt, source: "canvas" as const },
    ];

    await Promise.all(resources.map((resource) => storage.addResource(resource)));
    assert.equal((await storage.listResources()).length, 2);

    await Promise.all(resources.map((resource, index) => storage.updateResource(resource.id, { metadata: { concurrentIndex: index } })));
    const updated = await storage.listResources();
    assert.equal(updated.find((item) => item.id === firstFile.id)?.metadata?.concurrentIndex, 0);
    assert.equal(updated.find((item) => item.id === secondFile.id)?.metadata?.concurrentIndex, 1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
