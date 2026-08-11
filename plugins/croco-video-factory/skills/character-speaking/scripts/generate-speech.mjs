#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import { configFromEnv, loadSystemPrompt, parseCliArgs, runSpeechPipeline } from "./speech-pipeline.mjs";

const skillDir = fileURLToPath(new URL("../", import.meta.url));
const rootDir = path.resolve(process.env.CROCOTV_HOME || process.cwd());
const codexDir = path.join(rootDir, ".codex");

try {
    const args = parseCliArgs(process.argv.slice(2));
    process.loadEnvFile(process.env.CROCO_ENV_FILE || path.join(codexDir, ".env"));
    const config = configFromEnv(process.env);
    const systemPrompt = await loadSystemPrompt(skillDir);
    const outputPath = await runSpeechPipeline({ rootDir, config, systemPrompt, ...args }, {
        onProgress: (message) => console.error(message),
    });
    console.log(outputPath);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`错误：${message}`);
    process.exitCode = 1;
}
