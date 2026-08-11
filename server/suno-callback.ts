import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { resourceById, safeResourcePath } from "./storage";

type CallbackState = "idle" | "starting" | "ready" | "error";

let state: CallbackState = "idle";
let startup: Promise<string> | null = null;
let tunnel: ChildProcess | null = null;
let runtimePublicBaseUrl = "";
const temporaryAssets = new Map<string, { resourceId: string; expiresAt: number }>();

export function sunoCallbackState() { return state; }

export function startSunoCallbackService() {
  if (startup) return startup;
  state = "starting";
  startup = createCallbackService()
    .then((url) => {
      state = "ready";
      return url;
    })
    .catch((error) => {
      state = "error";
      startup = null;
      throw error;
    });
  return startup;
}

export async function getSunoCallbackUrl() {
  return startSunoCallbackService();
}

export async function getTemporaryPublicResourceUrl(resourceId: string, ttlMs = 15 * 60_000) {
  await startSunoCallbackService();
  if (!runtimePublicBaseUrl) throw new Error("临时资源公网服务尚未就绪");
  if (!await resourceById(resourceId)) throw new Error(`临时资源不存在：${resourceId}`);
  const token = randomUUID();
  const boundedTtl = Math.max(60_000, Math.min(60 * 60_000, ttlMs));
  temporaryAssets.set(token, { resourceId, expiresAt: Date.now() + boundedTtl });
  const cleanup = setTimeout(() => temporaryAssets.delete(token), boundedTtl);
  cleanup.unref();
  return `${runtimePublicBaseUrl}/runtime-assets/${token}`;
}

async function createCallbackService() {
  const callbackPath = `/callbacks/suno/${randomUUID()}`;
  const server = createServer((request, response) => {
    void handleRequest(request, response, callbackPath);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Suno 回调监听端口创建失败");

  const localUrl = `http://127.0.0.1:${address.port}`;
  try {
    const publicBaseUrl = await startQuickTunnel(localUrl);
    runtimePublicBaseUrl = publicBaseUrl;
    process.once("exit", () => {
      tunnel?.kill("SIGTERM");
      server.close();
    });
    return `${publicBaseUrl}${callbackPath}`;
  } catch (error) {
    server.close();
    throw error;
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, callbackPath: string) {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  if ((request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/runtime-assets/")) {
    await handleTemporaryAsset(request, response, pathname.slice("/runtime-assets/".length));
    return;
  }
  if (request.method !== "POST" || pathname !== callbackPath) {
    response.writeHead(404).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 2 * 1024 * 1024) throw new Error("Suno 回调内容过大");
      chunks.push(bytes);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as any;
    const taskId = payload?.data?.task_id || payload?.data?.taskId || payload?.taskId || "unknown";
    const callbackType = payload?.data?.callbackType || payload?.msg || "received";
    console.log(`Suno callback: ${callbackType} (${taskId})`);
    response.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "回调解析失败" }));
  }
}

async function handleTemporaryAsset(request: IncomingMessage, response: ServerResponse, token: string) {
  const entry = temporaryAssets.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    temporaryAssets.delete(token);
    response.writeHead(404).end();
    return;
  }
  const resource = await resourceById(entry.resourceId);
  if (!resource) {
    temporaryAssets.delete(token);
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": resource.mimeType,
    "Content-Length": resource.size,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(safeResourcePath(resource.fileName));
  stream.once("error", () => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  stream.pipe(response);
}

function startQuickTunnel(localUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const executable = path.resolve("node_modules/.bin/wrangler");
    const tunnelProcess = spawn(executable, ["tunnel", "quick-start", localUrl], {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    tunnel = tunnelProcess;
    let output = "";
    let settled = false;
    const finish = (error?: Error, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        tunnel?.kill("SIGTERM");
        reject(error);
      } else resolve(url!);
    };
    const read = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-20_000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) finish(undefined, match[0]);
    };
    tunnelProcess.stdout.on("data", read);
    tunnelProcess.stderr.on("data", read);
    tunnelProcess.once("error", (error) => finish(new Error(`Suno 公网回调隧道启动失败：${error.message}`)));
    tunnelProcess.once("exit", (code) => finish(new Error(`Suno 公网回调隧道提前退出（${code ?? "unknown"}）`)));
    const timeout = setTimeout(() => finish(new Error("Suno 公网回调隧道启动超时")), 60_000);
  });
}
