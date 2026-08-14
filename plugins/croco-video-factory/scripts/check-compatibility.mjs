#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { findInstalledPlugin } from "./update-helpers.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const bundle = JSON.parse(await readFile(path.join(pluginRoot, "bundle-manifest.json"), "utf8"));
const local = await locateCrocoHome();
if (local.envFile && existsSync(local.envFile)) process.loadEnvFile(local.envFile);
const apiOrigin = process.env.CROCO_LOCAL_API_ORIGIN || "http://127.0.0.1:4399";
const live = await readLiveStatus(apiOrigin);
const sourceCompatibility = local.home ? await readJson(path.join(local.home, "compatibility.json")) : null;
const appVersion = live?.version || sourceCompatibility?.components?.crocoTV || null;
const repositoryVersion = sourceCompatibility?.components?.crocoTV || null;
const contracts = live?.contracts || sourceCompatibility?.contracts || null;
const skillIntegrity = await verifySkills(bundle.skills || {});
const pluginInventory = await readPluginInventory();
const globalPlugin = findInstalledPlugin(pluginInventory, "croco-video-factory@croco");
const legacyPlugin = findInstalledPlugin(pluginInventory, "crocotv@personal");
const standaloneSkillConflicts = Object.keys(bundle.skills || {}).filter((name) => existsSync(path.join(homedir(), ".codex", "skills", name)));
const globalSkillIntegrity = globalPlugin?.source?.path
  ? await verifySkillsAt(path.join(globalPlugin.source.path, "skills"), bundle.skills || {})
  : { ok: false, mismatches: [{ reason: "global-plugin-source-unavailable" }] };
const mcpServerCollisions = await findMcpServerCollisions(pluginInventory);

const checks = {
  pluginMatchesBundle: plugin.version === bundle.pluginVersion,
  crocoTVCompatible: Boolean(appVersion && satisfies(appVersion, bundle.requires.crocoTV)),
  repositoryVersionMatches: repositoryVersion === bundle.suiteVersion,
  canvasApiCompatible: Boolean(contracts && contracts.canvasApi === bundle.requires.canvasApi),
  projectSchemaCompatible: Boolean(contracts && contracts.projectSchema === bundle.requires.projectSchema),
  environmentSchemaCompatible: Boolean(contracts && contracts.environmentSchema === bundle.requires.environmentSchema),
  skillsIntegrity: skillIntegrity.ok,
  globalPluginEnabled: Boolean(globalPlugin),
  globalPluginVersionMatches: globalPlugin?.version === plugin.version,
  globalPluginSkillsIntegrity: globalSkillIntegrity.ok,
  noStandaloneSkillConflicts: standaloneSkillConflicts.length === 0,
  noLegacyPluginConflict: !legacyPlugin,
  noMcpServerCollisions: mcpServerCollisions.length === 0,
};
const compatible = Object.values(checks).every(Boolean);
const result = {
  compatible,
  installed: {
    plugin: plugin.version,
    mcp: bundle.mcpVersion,
    skillsBundle: bundle.skillsBundleVersion,
    pluginRoot,
  },
  crocoTV: { version: appVersion, repositoryVersion, home: local.home, apiOrigin, running: Boolean(live), contracts },
  required: bundle.requires,
  checks,
  skillIntegrity,
  effectiveLoad: {
    pluginId: globalPlugin?.pluginId || null,
    pluginVersion: globalPlugin?.version || null,
    pluginSource: globalPlugin?.source?.path || null,
    standaloneSkillConflicts,
    legacyPlugin: legacyPlugin?.pluginId || null,
    mcpServerCollisions,
    globalSkillIntegrity,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!compatible) process.exitCode = 2;

async function locateCrocoHome() {
  const config = await readJson(path.join(homedir(), ".config", "crocotv", "config.json")) || {};
  const home = process.env.CROCOTV_HOME || config.home || "";
  return { home: home ? path.resolve(home) : null, envFile: process.env.CROCO_ENV_FILE || config.envFile || (home ? path.join(home, ".codex", ".env") : null) };
}

async function readLiveStatus(origin) {
  try {
    const response = await fetch(`${origin.replace(/\/$/, "")}/api/status`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function verifySkills(expected) {
  return verifySkillsAt(path.join(pluginRoot, "skills"), expected);
}

async function verifySkillsAt(skillsRoot, expected) {
  const mismatches = [];
  for (const [name, metadata] of Object.entries(expected)) {
    const directory = path.join(skillsRoot, name);
    const actual = existsSync(directory) ? await directoryHash(directory) : null;
    if (actual !== metadata.sha256) mismatches.push({ name, expected: metadata.sha256, actual });
  }
  return { ok: mismatches.length === 0, mismatches };
}

async function readPluginInventory() {
  try { return JSON.parse(await run("codex", ["plugin", "list", "--json"])); }
  catch { return { installed: [] }; }
}

async function findMcpServerCollisions(inventory) {
  const owners = new Map();
  for (const pluginEntry of inventory?.installed || []) {
    if (!pluginEntry.installed || !pluginEntry.enabled || !pluginEntry.source?.path) continue;
    const manifest = await readJson(path.join(pluginEntry.source.path, ".mcp.json"));
    for (const serverName of Object.keys(manifest?.mcpServers || {})) {
      if (!owners.has(serverName)) owners.set(serverName, []);
      owners.get(serverName).push(pluginEntry.pluginId);
    }
  }
  return [...owners.entries()]
    .filter(([, pluginIds]) => pluginIds.length > 1)
    .map(([serverName, pluginIds]) => ({ serverName, pluginIds }));
}

function satisfies(version, range) {
  const match = String(range).match(/^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/);
  if (!match) return version === range;
  return compare(version, match[1]) >= 0 && compare(version, match[2]) < 0;
}

function compare(left, right) {
  const a = String(left).split(/[+-]/)[0].split(".").map(Number);
  const b = String(right).split(/[+-]/)[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  return 0;
}

async function directoryHash(directory) {
  const hash = createHash("sha256");
  for (const file of await walk(directory)) {
    hash.update(path.relative(directory, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function walk(directory) {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name === "node_modules" || name === ".DS_Store") continue;
    const target = path.join(directory, name);
    if ((await stat(target)).isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

async function readJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; } }

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} failed`)));
  });
}
