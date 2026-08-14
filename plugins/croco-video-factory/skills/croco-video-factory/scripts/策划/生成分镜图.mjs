#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPngDimensions, fileDataUri, generateRunwareImage, GPT_IMAGE_02_MODEL, imageDimensionsForAspect, NANO_BANANA_LITE_MODEL, runwareConfig, sameExecutablePath } from "../公共/runware-client.mjs";

if (sameExecutablePath(process.argv[1], fileURLToPath(import.meta.url))) {
    try {
        const index = process.argv.indexOf("--shot-dir");
        if (index < 0) throw new Error("缺少 --shot-dir");
        const directory = path.resolve(process.argv[index + 1]);
        const attempts = (await readdir(directory)).filter((name) => /^分镜图-第\d+次\.png$/.test(name)).length;
        if (attempts >= 5) throw new Error("分镜图最多生成 5 次");
        const attempt = attempts + 1;
        const projectDir = path.dirname(path.dirname(directory));
        const plan = JSON.parse(await readFile(path.join(projectDir, "分镜", "分镜计划.json"), "utf8"));
        const shot = (plan.shots || []).find((item) => (item.folder || item.directory) === path.basename(directory));
        if (!shot) throw new Error("分镜计划.json 中找不到当前分镜");
        const dimensions = imageDimensionsForAspect(plan.aspectRatio);
        const scenes = await optionalJson(path.join(directory, "场景参考图.json")) || { references: [] };
        const plannedSceneIds = sceneIdsOf(shot);
        const referencedSceneIds = new Set((scenes.references || []).map((item) => String(item.sceneId || scenes.sceneId || "")).filter(Boolean));
        if (shot.sceneDesignRequired !== false && (!plannedSceneIds.length || !(scenes.references || []).length || plannedSceneIds.some((sceneId) => !referencedSceneIds.has(sceneId)))) throw new Error("当前分镜缺少与分镜计划 sceneIds 匹配的已验收场景参考图");
        const characters = JSON.parse(await readFile(path.join(directory, "角色参考图.json"), "utf8"));
        const scenePaths = [];
        for (const item of scenes.references || []) {
            const imagePath = path.resolve(directory, item.path);
            if (item.imageSha256 && createHash("sha256").update(await readFile(imagePath)).digest("hex") !== item.imageSha256) throw new Error(`场景参考图哈希失效：${item.path}`);
            scenePaths.push(imagePath);
        }
        const referencePaths = [...scenePaths, ...(characters.references || []).map((item) => path.resolve(directory, item.path))];
        const referenceImages = await Promise.all(referencePaths.map(fileDataUri));
        const outputPath = path.join(directory, `分镜图-第${String(attempt).padStart(2, "0")}次.png`);
        process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(process.env.CROCOTV_HOME || process.cwd(), ".codex", ".env"));
        const modelIndex = process.argv.indexOf("--image-model");
        const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : process.argv.includes("--fast") ? NANO_BANANA_LITE_MODEL : GPT_IMAGE_02_MODEL;
        const mode = model === NANO_BANANA_LITE_MODEL ? "fast" : "standard";
        const metadata = await generateRunwareImage({ config: runwareConfig(), model, prompt: await readFile(path.join(directory, "分镜画面提示词.md"), "utf8"), outputPath, referenceImages, width: dimensions.width, height: dimensions.height });
        const actual = await assertPngDimensions(outputPath, dimensions);
        await writeFile(path.join(directory, `分镜图-第${String(attempt).padStart(2, "0")}次生成.json`), `${JSON.stringify({ ...metadata, mode, aspectRatio: dimensions.aspectRatio, ...actual }, null, 2)}\n`);
        console.log(outputPath);
    } catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}

async function optionalJson(filePath) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
function sceneIdsOf(shot) { const values = Array.isArray(shot?.sceneIds) ? shot.sceneIds : shot?.sceneId ? [shot.sceneId] : []; return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
