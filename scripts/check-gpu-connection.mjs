#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.env.CROCOTV_HOME || process.cwd());
const envFile = path.resolve(process.env.CROCO_ENV_FILE || path.join(repositoryRoot, ".codex", ".env"));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const baseUrl = String(process.env.GPU_API_BASE_URL || process.env.H3_BASE_URL || "").trim().replace(/\/+$/, "");
const token = String(process.env.GPU_API_TOKEN || process.env.H3_API_KEY || "").trim();

if (!baseUrl) throw new Error(`缺少 GPU_API_BASE_URL，请填写 ${envFile}`);
if (!token) throw new Error(`缺少 GPU_API_TOKEN，请填写 ${envFile}`);
if (/\/api\/v2$/i.test(baseUrl)) throw new Error("GPU_API_BASE_URL 只填写调度中心根地址，不要包含 /api/v2");

const response = await fetch(`${baseUrl}/api/v2/models`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(30_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  const detail = typeof payload?.detail === "string"
    ? payload.detail
    : typeof payload?.detail?.message === "string"
      ? payload.detail.message
      : `HTTP ${response.status}`;
  throw new Error(`GPU 调度中心连接失败：${String(detail).replace(/\s+/g, " ").slice(0, 300)}`);
}

const contracts = Array.isArray(payload.items)
  ? payload.items.map((item) => `${item.model_id}@${item.contract_version}`).sort()
  : [];

console.log(JSON.stringify({
  ok: true,
  base_url: baseUrl,
  contract_count: contracts.length,
  contracts,
}, null, 2));
