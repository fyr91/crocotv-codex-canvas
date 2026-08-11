import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const crocoHome = path.resolve(process.env.CROCOTV_HOME || repositoryRoot);
export const crocoEnvFile = path.resolve(
  process.env.CROCO_ENV_FILE || path.join(crocoHome, ".codex", ".env"),
);

process.env.CROCOTV_HOME = crocoHome;
process.env.CROCO_ENV_FILE = crocoEnvFile;

if (existsSync(crocoEnvFile)) process.loadEnvFile(crocoEnvFile);
