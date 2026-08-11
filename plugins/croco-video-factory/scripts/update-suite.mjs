#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm");
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? args[targetIndex + 1] : "main";
const config = JSON.parse(await readFile(path.join(homedir(), ".config", "crocotv", "config.json"), "utf8"));
const home = path.resolve(process.env.CROCOTV_HOME || config.home);
const remote = (await run("git", ["remote", "get-url", "origin"], home)).trim();
if (!/(github\.com[:/])fyr91\/crocotv-codex-canvas(?:\.git)?$/i.test(remote)) throw new Error(`拒绝从未授权的 origin 更新：${remote}`);
const dirty = (await run("git", ["status", "--porcelain"], home)).trim();
if (dirty) throw new Error("Git 工作区存在未提交修改；请先提交或另行保存后再更新。");

const current = (await run("git", ["rev-parse", "--short", "HEAD"], home)).trim();
console.log(JSON.stringify({ home, remote, current, target, mode: apply ? "apply" : "plan" }, null, 2));
if (!apply) process.exit(0);
if (!confirmed) throw new Error("应用更新必须同时传入 --apply --confirm");

await run("git", ["fetch", "origin", "--tags"], home, true);
if (target === "main") await run("git", ["merge", "--ff-only", "origin/main"], home, true);
else await run("git", ["switch", "--detach", target], home, true);
await run("npm", ["ci"], home, true);
await run("npm", ["ci", "--prefix", "web", "--legacy-peer-deps"], home, true);
await run("npm", ["run", "build"], home, true);
await run("npm", ["run", "setup"], home, true);
await run("codex", ["plugin", "marketplace", "upgrade", "croco"], home, true);
await run("codex", ["plugin", "add", "croco-video-factory@croco"], home, true);
console.log("更新完成。请开启新的 Codex 任务以加载新版 Plugin、MCP 和 Skills。");

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
