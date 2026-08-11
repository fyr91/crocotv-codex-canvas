import path from "node:path";
import { readFile } from "node:fs/promises";
import { resourceById, safeResourcePath } from "./storage";
import { getTemporaryPublicResourceUrl } from "./suno-callback";

const MAX_BROKER_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_REFRESH_MS = 13 * 60_000;
const MIN_SIGNED_URL_VALIDITY_MS = 2 * 60_000;

type CachedBrokerLease = {
  resourceId: string;
  mimeType: string;
  leaseId: string;
  url: string;
  expiresAt: number;
  brokerUrl: string;
  clientToken: string;
  refreshTimer?: ReturnType<typeof setTimeout>;
};

const brokerLeaseCache = new Map<string, CachedBrokerLease>();
const brokerLeasePending = new Map<string, Promise<CachedBrokerLease>>();

export type ModelAssetLease = {
  mimeType: string;
  url: string;
  release: () => Promise<void>;
};

export async function createModelAssetLease(resourceId: string): Promise<ModelAssetLease> {
  const resource = await resourceById(resourceId);
  if (!resource) throw new Error(`多模态资源不存在：${resourceId}`);
  const brokerUrl = String(process.env.CROCO_TEMP_ASSET_BROKER_URL || "").trim();
  const clientToken = String(process.env.CROCO_TEMP_ASSET_CLIENT_TOKEN || "").trim();
  if (!brokerUrl && !clientToken) {
    return {
      mimeType: resource.mimeType,
      url: await getTemporaryPublicResourceUrl(resourceId),
      release: async () => undefined,
    };
  }
  if (!brokerUrl || !clientToken) throw new Error("Supabase 临时素材服务配置不完整，请同时填写 Broker URL 和客户端 Token");
  if (resource.size < 1 || resource.size > MAX_BROKER_BYTES) throw new Error(`模型临时素材必须在 1–10 MB 之间：${resource.name}`);
  const lease = await freshBrokerLease(resourceId, resource, brokerUrl, clientToken);
  return { mimeType: lease.mimeType, url: lease.url, release: async () => undefined };
}

async function freshBrokerLease(
  resourceId: string,
  resource: NonNullable<Awaited<ReturnType<typeof resourceById>>>,
  brokerUrl: string,
  clientToken: string,
) {
  const cached = brokerLeaseCache.get(resourceId);
  if (cached && cached.expiresAt - Date.now() > MIN_SIGNED_URL_VALIDITY_MS) return cached;
  const pending = brokerLeasePending.get(resourceId);
  if (pending) return pending;
  const operation = (async () => {
    const latest = brokerLeaseCache.get(resourceId);
    if (latest && latest.expiresAt - Date.now() > MIN_SIGNED_URL_VALIDITY_MS) return latest;
    if (latest) {
      try { return await renewBrokerLease(latest); }
      catch { brokerLeaseCache.delete(resourceId); }
    }
    return createBrokerLease(resourceId, resource, brokerUrl, clientToken);
  })();
  brokerLeasePending.set(resourceId, operation);
  try {
    const lease = await operation;
    brokerLeaseCache.set(resourceId, lease);
    scheduleBrokerLeaseRefresh(lease);
    return lease;
  } finally {
    if (brokerLeasePending.get(resourceId) === operation) brokerLeasePending.delete(resourceId);
  }
}

async function createBrokerLease(
  resourceId: string,
  resource: NonNullable<Awaited<ReturnType<typeof resourceById>>>,
  brokerUrl: string,
  clientToken: string,
): Promise<CachedBrokerLease> {
  const bytes = await readFile(safeResourcePath(resource.fileName));
  if (bytes.byteLength !== resource.size) throw new Error(`模型临时素材大小校验失败：${resource.name}`);
  let leaseId = "";
  try {
    const prepared = await brokerRequest(brokerUrl, clientToken, {
      action: "prepare",
      fileName: path.basename(resource.fileName),
      contentType: resource.mimeType || "application/octet-stream",
      byteSize: bytes.byteLength,
    }) as { leaseId?: unknown; upload?: { signedUrl?: unknown } };
    leaseId = String(prepared.leaseId || "");
    const uploadUrl = String(prepared.upload?.signedUrl || "");
    if (!leaseId || !uploadUrl) throw new Error("Supabase 临时素材服务没有返回上传租约");
    await uploadSignedAsset(uploadUrl, resource.mimeType || "application/octet-stream", bytes);
    const finalized = await finalizeBrokerLease(brokerUrl, clientToken, leaseId);
    return { resourceId, mimeType: resource.mimeType, leaseId, url: finalized.url, expiresAt: finalized.expiresAt, brokerUrl, clientToken };
  } catch (error) {
    if (leaseId) await brokerRequest(brokerUrl, clientToken, { action: "release", leaseId }).catch(() => undefined);
    throw error;
  }
}

async function renewBrokerLease(lease: CachedBrokerLease): Promise<CachedBrokerLease> {
  const finalized = await finalizeBrokerLease(lease.brokerUrl, lease.clientToken, lease.leaseId);
  if (lease.refreshTimer) clearTimeout(lease.refreshTimer);
  return { ...lease, url: finalized.url, expiresAt: finalized.expiresAt, refreshTimer: undefined };
}

async function finalizeBrokerLease(brokerUrl: string, clientToken: string, leaseId: string) {
  const finalized = await brokerRequest(brokerUrl, clientToken, { action: "finalize", leaseId }) as { signedUrl?: unknown; expiresAt?: unknown };
  const url = String(finalized.signedUrl || "");
  const expiresAt = new Date(String(finalized.expiresAt || "")).getTime();
  if (!url || !Number.isFinite(expiresAt)) throw new Error("Supabase 临时素材服务没有返回有效的模型访问地址");
  return { url, expiresAt };
}

function scheduleBrokerLeaseRefresh(lease: CachedBrokerLease) {
  if (lease.refreshTimer) clearTimeout(lease.refreshTimer);
  const delay = Math.max(1_000, Math.min(SIGNED_URL_REFRESH_MS, lease.expiresAt - Date.now() - MIN_SIGNED_URL_VALIDITY_MS));
  lease.refreshTimer = setTimeout(() => {
    if (brokerLeaseCache.get(lease.resourceId) !== lease || brokerLeasePending.has(lease.resourceId)) return;
    const operation = renewBrokerLease(lease)
      .catch(async () => {
        const resource = await resourceById(lease.resourceId);
        if (!resource) throw new Error("本地资源已不存在");
        return createBrokerLease(lease.resourceId, resource, lease.brokerUrl, lease.clientToken);
      });
    brokerLeasePending.set(lease.resourceId, operation);
    void operation.then((renewed) => {
      if (brokerLeaseCache.get(lease.resourceId) === lease) {
        brokerLeaseCache.set(lease.resourceId, renewed);
        scheduleBrokerLeaseRefresh(renewed);
      }
    }).catch(() => {
      if (brokerLeaseCache.get(lease.resourceId) === lease) brokerLeaseCache.delete(lease.resourceId);
    }).finally(() => {
      if (brokerLeasePending.get(lease.resourceId) === operation) brokerLeasePending.delete(lease.resourceId);
    });
  }, delay);
  lease.refreshTimer.unref();
}

async function brokerRequest(url: string, token: string, body: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Croco-Asset-Token": token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json().catch(() => ({})) as { error?: unknown };
      if (response.ok) return payload;
      if (attempt < 2 && retryableStatus(response.status)) {
        await retryDelay(attempt);
        continue;
      }
      throw new Error(String(payload.error || `Supabase 临时素材服务失败（${response.status}）`).slice(0, 300));
    } catch (error) {
      if (attempt >= 2 || (error instanceof Error && /Supabase 临时素材服务失败|客户端凭据|租约|文件大小/.test(error.message))) throw error;
      await retryDelay(attempt);
    }
  }
  throw new Error("Supabase 临时素材服务暂时不可用");
}

async function uploadSignedAsset(url: string, mimeType: string, bytes: Buffer) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": mimeType, "X-Upsert": "false" },
        body: new Blob([Uint8Array.from(bytes)], { type: mimeType }),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return;
      if (attempt < 2 && retryableStatus(response.status)) {
        await retryDelay(attempt);
        continue;
      }
      throw new Error(`Supabase 临时素材上传失败（${response.status}）`);
    } catch (error) {
      if (attempt >= 2 || (error instanceof Error && /Supabase 临时素材上传失败/.test(error.message))) throw error;
      await retryDelay(attempt);
    }
  }
}

function retryableStatus(status: number) { return status === 429 || status === 502 || status === 503 || status === 504; }
function retryDelay(attempt: number) { return new Promise((resolve) => setTimeout(resolve, 350 * 3 ** attempt + Math.floor(Math.random() * 200))); }
