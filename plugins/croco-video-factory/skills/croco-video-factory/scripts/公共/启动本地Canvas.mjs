#!/usr/bin/env node

import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const apiOrigin = process.env.CROCO_LOCAL_API_ORIGIN || "http://127.0.0.1:4399";
const webOrigin = process.env.CROCO_LOCAL_WEB_ORIGIN || "http://localhost:3000";
const studioOrigin = process.env.CROCO_LOCAL_STUDIO_ORIGIN || "http://localhost:3010";
const configPath = path.join(homedir(), ".config", "crocotv", "config.json");
const configured = readJson(configPath);
const workspaceRoot = resolveWorkspace(process.env.CROCOTV_HOME, configured.home, process.cwd());

try {
    const initial = await serviceStatus();
    if (initial.api && initial.web && initial.studio) {
        console.log(JSON.stringify({ ...initial, started: false }, null, 2));
        process.exit(0);
    }

    const npmScripts = [
        ...(!initial.api ? ["dev:server"] : []),
        ...(!initial.web ? ["dev:canvas"] : []),
        ...(!initial.studio ? ["dev:studio"] : []),
    ];
    const runtimeDir = path.join(workspaceRoot, "data", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    const logPath = path.join(runtimeDir, "crocotv.log");
    for (const npmScript of npmScripts) await startDetached(npmScript, logPath);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        await wait(400);
        const current = await serviceStatus();
        if (current.api && current.web && current.studio) {
            console.log(JSON.stringify({ ...current, started: true, npmScripts, logPath }, null, 2));
            process.exit(0);
        }
    }
    throw new Error(`CrocoTV 启动超时，请查看 ${logPath}`);
} catch (error) {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}

function resolveWorkspace(...candidates) {
    for (const candidate of candidates) {
        if (!String(candidate || "").trim()) continue;
        const directory = path.resolve(String(candidate));
        const manifest = readJson(path.join(directory, "package.json"));
        if (manifest.name === "croco-canvas-local") return directory;
    }
    throw new Error(`CrocoTV 本地项目未配置；请设置 CROCOTV_HOME 或检查 ${configPath}`);
}

async function serviceStatus() {
    const [app, web, studio] = await Promise.all([readStatus(`${apiOrigin}/api/status`), reachable(webOrigin), reachable(studioOrigin)]);
    return { api: Boolean(app), web, studio, apiOrigin, webOrigin, studioOrigin, version: app?.version || null };
}

async function startDetached(npmScript, logPath) {
    const log = openSync(logPath, "a");
    try {
        await new Promise((resolve, reject) => {
            const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", npmScript], {
                cwd: workspaceRoot,
                detached: true,
                stdio: ["ignore", log, log],
                env: process.env,
            });
            child.once("error", reject);
            child.once("spawn", () => {
                child.unref();
                resolve();
            });
        });
    } finally {
        closeSync(log);
    }
}

async function readStatus(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

async function reachable(url) {
    try {
        // Next.js may spend several seconds compiling its first page in dev.
        // A short timeout misclassifies a healthy listening Studio as missing
        // and can launch a duplicate process on the same port.
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        return response.ok;
    } catch {
        return false;
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
        return {};
    }
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
