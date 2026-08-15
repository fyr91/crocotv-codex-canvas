#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { findInstalledPlugin, migrateStandaloneSkills, parseDirtyEntries, restoreStandaloneSkills } from "./update-helpers.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm");
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? args[targetIndex + 1] : "main";
if (!target || target.startsWith("-")) throw new Error("--target 必须提供有效的 Git ref");
const config = JSON.parse(await readFile(path.join(homedir(), ".config", "crocotv", "config.json"), "utf8"));
const home = path.resolve(process.env.CROCOTV_HOME || config.home);
const remote = (await run("git", ["remote", "get-url", "origin"], home)).trim();
if (!/(github\.com[:/])fyr91\/crocotv-codex-canvas(?:\.git)?$/i.test(remote)) throw new Error(`拒绝从未授权的 origin 更新：${remote}`);
const current = (await run("git", ["rev-parse", "--short", "HEAD"], home)).trim();
const dirtyEntries = parseDirtyEntries(await run("git", ["status", "--porcelain"], home));
if (dirtyEntries.length) {
  console.error(JSON.stringify({
    status: "blocked",
    reason: "dirty-worktree",
    message: "CrocoTV 应用仓库存在未提交修改；整套更新已停止。请先提交或自行保存这些修改后重试。不会自动 stash、覆盖、reset，也不会只更新 Plugin/Skills。",
    home,
    current,
    target,
    dirtyEntries,
  }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ status: "ready", home, remote, current, target, mode: apply ? "apply" : "plan" }, null, 2));
if (!apply) process.exit(0);
if (!confirmed) throw new Error("应用更新必须同时传入 --apply --confirm");

await run("git", ["fetch", "origin", "--tags"], home, true);
if (target === "main") await run("git", ["merge", "--ff-only", "origin/main"], home, true);
else await run("git", ["switch", "--detach", target], home, true);
await run("npm", ["ci"], home, true);
await run("npm", ["ci", "--prefix", "web", "--legacy-peer-deps"], home, true);
await run("npm", ["ci", "--prefix", "studio"], home, true);
await run("npm", ["run", "build"], home, true);
await run("npm", ["run", "setup"], home, true);

const marketplaceList = await run("codex", ["plugin", "marketplace", "list"], home);
if (/^croco\s+/m.test(marketplaceList)) await run("codex", ["plugin", "marketplace", "upgrade", "croco"], home, true);
else await run("codex", ["plugin", "marketplace", "add", "fyr91/crocotv-codex-canvas", "--ref", target], home, true);

const installResult = JSON.parse(await run("codex", ["plugin", "add", "croco-video-factory@croco", "--json"], home));
const sourceBundle = JSON.parse(await readFile(path.join(home, "plugins", "croco-video-factory", "bundle-manifest.json"), "utf8"));
const backupRoot = path.join(homedir(), ".codex", "backups", "croco-video-factory", new Date().toISOString().replace(/[:.]/g, "-"));
let movedSkills = [];
let legacyPluginRemoved = false;

try {
  movedSkills = await migrateStandaloneSkills({
    skillsRoot: path.join(homedir(), ".codex", "skills"),
    skillNames: Object.keys(sourceBundle.skills || {}),
    backupRoot,
  });

  const inventory = JSON.parse(await run("codex", ["plugin", "list", "--json"], home));
  if (findInstalledPlugin(inventory, "crocotv@personal")) {
    await run("codex", ["plugin", "remove", "crocotv@personal", "--json"], home);
    legacyPluginRemoved = true;
  }

  const verification = JSON.parse(await run("node", [path.join(installResult.installedPath, "scripts", "check-compatibility.mjs")], home));
  console.log(JSON.stringify({
    status: "updated",
    home,
    target,
    installedPlugin: installResult,
    migratedStandaloneSkills: movedSkills.map(({ name, target: backup }) => ({ name, backup })),
    removedLegacyPlugin: legacyPluginRemoved ? "crocotv@personal" : null,
    verification,
  }, null, 2));
  console.log("整套更新完成。请开启新的 Codex 任务以加载新版应用、Plugin、MCP 和 Skills。");
} catch (error) {
  await restoreStandaloneSkills(movedSkills);
  if (legacyPluginRemoved) {
    try { await run("codex", ["plugin", "add", "crocotv@personal", "--json"], home); } catch {}
  }
  throw new Error(`更新后的全局验证失败；旧独立 Skills 已恢复${legacyPluginRemoved ? "，旧 Plugin 已尝试恢复" : ""}。${error.message}`);
}

function run(command, commandArgs, cwd, inherit = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => stdout += chunk);
    child.stderr?.on("data", (chunk) => stderr += chunk);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} ${commandArgs.join(" ")} 失败：${stderr.trim()}`)));
  });
}
