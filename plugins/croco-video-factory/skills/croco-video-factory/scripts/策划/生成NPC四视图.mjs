#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRunwareImage, NANO_BANANA_LITE_MODEL, runwareConfig, sameExecutablePath } from "../公共/runware-client.mjs";

export async function generateNpcFourView({ npcDir, config = runwareConfig(), model = NANO_BANANA_LITE_MODEL } = {}) {
    const directory = path.resolve(String(npcDir || ""));
    if (!npcDir) throw new Error("缺少 --npc-dir");
    const files = await readdir(directory);
    const attempts = files.filter((name) => /^(?:四视图|三视图)-第\d+次\.png$/u.test(name)).length;
    if (attempts >= 5) throw new Error("角色参考图最多生成 5 次");
    const attempt = attempts + 1;
    const outputPath = path.join(directory, `四视图-第${String(attempt).padStart(2, "0")}次.png`);
    const promptPath = await preferredExistingPath(directory, ["四视图提示词.md", "三视图提示词.md"]);
    const metadata = await generateRunwareImage({
        config,
        prompt: await readFile(promptPath, "utf8"),
        outputPath,
        model,
        width: 2048,
        height: 1024,
    });
    await writeFile(path.join(directory, `四视图-第${String(attempt).padStart(2, "0")}次生成.json`), `${JSON.stringify({ ...metadata, template: "four-view-v1" }, null, 2)}\n`, "utf8");
    return outputPath;
}

async function preferredExistingPath(directory, names) {
    const files = new Set(await readdir(directory));
    const name = names.find((candidate) => files.has(candidate));
    if (!name) throw new Error(`缺少 ${names[0]}`);
    return path.join(directory, name);
}

if (sameExecutablePath(process.argv[1], fileURLToPath(import.meta.url))) {
    try {
        const index = process.argv.indexOf("--npc-dir");
        if (index < 0 || !process.argv[index + 1]) throw new Error("缺少 --npc-dir");
        process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env"));
        const modelIndex = process.argv.indexOf("--image-model");
        console.log(await generateNpcFourView({ npcDir: process.argv[index + 1], config: runwareConfig(), model: modelIndex >= 0 ? process.argv[modelIndex + 1] : NANO_BANANA_LITE_MODEL }));
    } catch (error) {
        console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
