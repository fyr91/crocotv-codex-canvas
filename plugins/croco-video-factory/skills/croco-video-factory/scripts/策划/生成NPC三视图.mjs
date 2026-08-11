#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRunwareImage, runwareConfig, sameExecutablePath } from "../公共/runware-client.mjs";

if (sameExecutablePath(process.argv[1], fileURLToPath(import.meta.url))) {
    try {
        const index = process.argv.indexOf("--npc-dir");
        if (index < 0) throw new Error("缺少 --npc-dir");
        const directory = path.resolve(process.argv[index + 1]);
        const attempts = (await readdir(directory)).filter((name) => /^三视图-第\d+次\.png$/.test(name)).length;
        if (attempts >= 5) throw new Error("三视图最多生成 5 次");
        const attempt = attempts + 1;
        const outputPath = path.join(directory, `三视图-第${String(attempt).padStart(2, "0")}次.png`);
        process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env"));
        const metadata = await generateRunwareImage({ config: runwareConfig(), prompt: await readFile(path.join(directory, "三视图提示词.md"), "utf8"), outputPath, width: 2048, height: 512 });
        await writeFile(path.join(directory, `三视图-第${String(attempt).padStart(2, "0")}次生成.json`), `${JSON.stringify(metadata, null, 2)}\n`);
        console.log(outputPath);
    } catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}
