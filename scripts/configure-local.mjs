#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const repositoryRoot = path.resolve(process.env.CROCOTV_HOME || process.cwd());
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
if (packageJson.name !== "croco-canvas-local") throw new Error(`不是 CrocoTV 本地项目：${repositoryRoot}`);

const codexDirectory = path.join(repositoryRoot, ".codex");
const envFile = path.join(codexDirectory, ".env");
const envExample = path.join(codexDirectory, ".env.example");
await mkdir(codexDirectory, { recursive: true });

if (args.has("--migrate-env")) await migrateLegacyEnvironment(repositoryRoot, envFile);
if (!existsSync(envFile)) await copyFile(envExample, envFile);

const configDirectory = path.join(homedir(), ".config", "crocotv");
const configFile = path.join(configDirectory, "config.json");
const temporaryFile = `${configFile}.${process.pid}.tmp`;
await mkdir(configDirectory, { recursive: true });
await writeFile(temporaryFile, `${JSON.stringify({ home: repositoryRoot, envFile }, null, 2)}\n`, { mode: 0o600 });
await rename(temporaryFile, configFile);

console.log(JSON.stringify({ home: repositoryRoot, envFile, configFile }, null, 2));

async function migrateLegacyEnvironment(root, target) {
  const legacy = path.join(root, ".env");
  if (!existsSync(legacy)) return;
  const targetText = existsSync(target) ? await readFile(target, "utf8") : "";
  const legacyText = await readFile(legacy, "utf8");
  const known = new Set(variableNames(targetText));
  const missingLines = legacyText.split(/\r?\n/).filter((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    return match && !known.has(match[1]);
  });
  const merged = [targetText.trimEnd(), missingLines.length ? "\n# Migrated from legacy root .env" : "", ...missingLines].filter(Boolean).join("\n");
  await writeFile(target, `${merged}\n`, { mode: 0o600 });
  const backup = path.join(root, `.env.legacy-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await rename(legacy, backup);
  console.error(`Legacy .env 已迁移并保留备份：${backup}`);
}

function variableNames(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    return match ? [match[1]] : [];
  });
}
