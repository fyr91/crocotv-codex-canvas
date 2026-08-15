import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { clearProviderSecret, listProviderSecretStatuses, revealProviderSecret, updateProviderSecret } from "./provider-secrets";

test("Provider 密钥状态脱敏，空更新保留，清除必须显式执行", { concurrency: false }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "croco-provider-secrets-"));
  const envFile = path.join(directory, ".env");
  const original = process.env.ARK_API_KEY;
  await writeFile(envFile, "KEEP=value\nARK_API_KEY=old-secret-value\n");
  try {
    const initial = (await listProviderSecretStatuses(envFile)).find((item) => item.key === "ARK_API_KEY")!;
    assert.equal(initial.configured, true);
    assert.equal(initial.maskedValue.includes("old-secret-value"), false);
    await updateProviderSecret("ARK_API_KEY", "", envFile);
    assert.equal(await revealProviderSecret("ARK_API_KEY", envFile), "old-secret-value");
    await updateProviderSecret("ARK_API_KEY", "new-secret-value", envFile);
    assert.equal(await revealProviderSecret("ARK_API_KEY", envFile), "new-secret-value");
    await clearProviderSecret("ARK_API_KEY", envFile);
    assert.equal(await revealProviderSecret("ARK_API_KEY", envFile), "");
    assert.match(await readFile(envFile, "utf8"), /^KEEP=value/m);
  } finally {
    if (original === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = original;
    await rm(directory, { recursive: true, force: true });
  }
});
