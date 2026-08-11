#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPngDimensions, fileDataUri, generateRunwareImage, imageDimensionsForAspect, runwareConfig, sameExecutablePath } from "../公共/runware-client.mjs";

export async function generateSceneDesign({ viewDir, config = runwareConfig(), aspectRatio = null } = {}) {
    const directory = path.resolve(String(viewDir || ""));
    if (!viewDir) throw new Error("缺少 --view-dir");
    const attempts = (await readdir(directory)).filter((name) => /^场景设计图-第\d+次\.png$/u.test(name)).length;
    if (attempts >= 5) throw new Error("同一场景视图最多生成 5 次");
    const attempt = attempts + 1;
    const sceneRoot = await findAncestorWithFile(directory, "场景计划.json");
    const scenePlan = sceneRoot ? await optionalJson(path.join(sceneRoot, "场景计划.json")) : null;
    const dimensions = imageDimensionsForAspect(aspectRatio || scenePlan?.aspectRatio || "16:9");
    const references = await optionalJson(path.join(directory, "输入参考图.json")) || { references: [] };
    const referenceImages = [];
    for (const item of references.references || []) {
        const imagePath = path.resolve(directory, String(item.path || ""));
        await stat(imagePath);
        referenceImages.push(await fileDataUri(imagePath));
    }
    const outputPath = path.join(directory, `场景设计图-第${String(attempt).padStart(2, "0")}次.png`);
    const metadata = await generateRunwareImage({ config, prompt: await readFile(path.join(directory, "场景设计提示词.md"), "utf8"), outputPath, referenceImages, width: dimensions.width, height: dimensions.height });
    const actual = await assertPngDimensions(outputPath, dimensions);
    await writeFile(path.join(directory, `场景设计图-第${String(attempt).padStart(2, "0")}次生成.json`), `${JSON.stringify({ ...metadata, aspectRatio: dimensions.aspectRatio, ...actual }, null, 2)}\n`, "utf8");
    return outputPath;
}

async function optionalJson(filePath) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function findAncestorWithFile(start, name) { let current = start; while (true) { try { await stat(path.join(current, name)); return current; } catch (error) { if (error.code !== "ENOENT") throw error; } const parent = path.dirname(current); if (parent === current) return null; current = parent; } }

if (sameExecutablePath(process.argv[1], fileURLToPath(import.meta.url))) {
    try {
        const index = process.argv.indexOf("--view-dir");
        if (index < 0 || !process.argv[index + 1]) throw new Error("缺少 --view-dir");
        process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env"));
        const aspectIndex = process.argv.indexOf("--aspect-ratio");
        console.log(await generateSceneDesign({ viewDir: process.argv[index + 1], config: runwareConfig(), aspectRatio: aspectIndex >= 0 ? process.argv[aspectIndex + 1] : null }));
    } catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}
