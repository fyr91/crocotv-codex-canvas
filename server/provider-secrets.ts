import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const providerSecretKeys = [
  "CODING_PLAN_API_KEY",
  "ARK_API_KEY",
  "BIGMODEL_API_KEY",
  "RUNWARE_API_KEY",
  "GPU_API_TOKEN",
  "H3_API_KEY",
  "SUNO_API_KEY",
  "CROCO_CHARACTERS_API_TOKEN",
  "DOUBAO_TTS_API_KEY",
] as const;

export type ProviderSecretKey = typeof providerSecretKeys[number];
export const providerEnvFile = path.resolve(".codex/.env");

export async function listProviderSecretStatuses(envFile = providerEnvFile) {
  const document = await readEnvDocument(envFile);
  const fileUpdatedAt = await stat(envFile).then((value) => value.mtime.toISOString()).catch(() => undefined);
  return providerSecretKeys.map((key) => {
    const fileValue = document.values.get(key);
    const value = fileValue ?? process.env[key] ?? "";
    return {
      key,
      configured: Boolean(value),
      maskedValue: maskSecret(value),
      source: fileValue !== undefined ? "local-env" : value ? "process-env" : "none",
      ...(fileUpdatedAt ? { updatedAt: fileUpdatedAt } : {}),
    };
  });
}

export async function updateProviderSecret(rawKey: string, value: unknown, envFile = providerEnvFile) {
  const key = providerSecretKey(rawKey);
  if (value === "" || value == null) return (await listProviderSecretStatuses(envFile)).find((item) => item.key === key)!;
  if (typeof value !== "string" || value.length > 10_000 || /[\r\n\0]/.test(value)) throw new Error("Provider 密钥格式无效");
  const document = await readEnvDocument(envFile);
  const nextLine = `${key}=${JSON.stringify(value)}`;
  const lines = replaceEnvLine(document.lines, key, nextLine);
  await atomicWriteEnv(envFile, lines);
  process.env[key] = value;
  return (await listProviderSecretStatuses(envFile)).find((item) => item.key === key)!;
}

export async function clearProviderSecret(rawKey: string, envFile = providerEnvFile) {
  const key = providerSecretKey(rawKey);
  const document = await readEnvDocument(envFile);
  await atomicWriteEnv(envFile, document.lines.filter((line) => !envLineMatches(line, key)));
  delete process.env[key];
  return (await listProviderSecretStatuses(envFile)).find((item) => item.key === key)!;
}

export async function revealProviderSecret(rawKey: string, envFile = providerEnvFile) {
  const key = providerSecretKey(rawKey);
  const document = await readEnvDocument(envFile);
  return document.values.get(key) ?? process.env[key] ?? "";
}

function providerSecretKey(value: string): ProviderSecretKey {
  if (!providerSecretKeys.includes(value as ProviderSecretKey)) throw new Error("不支持的 Provider 密钥");
  return value as ProviderSecretKey;
}

async function readEnvDocument(envFile: string) {
  const text = await readFile(envFile, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
  const lines = text ? text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n") : [];
  const values = new Map<string, string>();
  for (const key of providerSecretKeys) {
    const line = [...lines].reverse().find((candidate) => envLineMatches(candidate, key));
    if (line) values.set(key, parseEnvValue(line.slice(line.indexOf("=") + 1)));
  }
  return { lines, values };
}

function replaceEnvLine(lines: string[], key: string, nextLine: string) {
  const next = [...lines];
  const index = next.findIndex((line) => envLineMatches(line, key));
  if (index >= 0) {
    next[index] = nextLine;
    return next.filter((line, lineIndex) => lineIndex === index || !envLineMatches(line, key));
  }
  next.push(nextLine);
  return next;
}

function envLineMatches(line: string, key: string) { return new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line); }
function parseEnvValue(value: string) { const trimmed = value.trim(); if (trimmed.startsWith('"') && trimmed.endsWith('"')) { try { return JSON.parse(trimmed); } catch {} } return trimmed.replace(/^'|'$/g, ""); }
function maskSecret(value: string) { return value ? value.length <= 8 ? "••••••••" : `${value.slice(0, 3)}••••${value.slice(-3)}` : ""; }

async function atomicWriteEnv(envFile: string, lines: string[]) {
  await mkdir(path.dirname(envFile), { recursive: true });
  const temp = path.join(path.dirname(envFile), `.env.tmp-${process.pid}-${randomUUID()}`);
  await writeFile(temp, `${lines.join("\n")}\n`, { mode: 0o600 });
  await rename(temp, envFile);
}
