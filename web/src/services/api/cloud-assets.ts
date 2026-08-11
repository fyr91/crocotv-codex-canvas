export type CloudAsset = { id: string; user_id?: string; kind: "image" | "video" | "audio" | "file" | "text"; audio_kind?: "speech" | "music" | null; title: string; storage_path: string | null; mime_type: string | null; byte_size: number | null; width?: number | null; height?: number | null; duration_seconds?: number | null; content?: string | null; metadata?: Record<string, unknown>; source_generation_id?: string | null; output_index?: number | null; created_at?: string; updated_at?: string; deleted_at?: string | null; shared_at?: string | null; url?: string; coverUrl?: string; lastFrameUrl?: string };
export type CloudAssetFields = { width?: number; height?: number; duration_seconds?: number; audio_kind?: "speech" | "music"; metadata?: Record<string, unknown> };
export type CloudUploadOptions = { onProgress?: (uploadedBytes: number, totalBytes: number) => void };
export type SaveCloudAssetInput = CloudAssetFields & { sourceAssetId?: string; sourceUrl: string; kind: "image" | "video" | "audio"; title: string; mimeType: string };
type LocalResource = { id: string; name: string; type: "image" | "video" | "audio" | "file"; mimeType: string; size: number; fileName: string; url: string; createdAt: string; source: string; metadata?: Record<string, unknown> };
const assetsByUrl = new Map<string, CloudAsset>();

export function cloudAssetForUrl(url: string) { return assetsByUrl.get(url); }
export async function uploadCloudAsset(blob: Blob, _kind: CloudAsset["kind"], title: string, fields: CloudAssetFields = {}, options: CloudUploadOptions = {}) {
    options.onProgress?.(0, blob.size);
    const body = new FormData(); body.append("file", new File([blob], title || "resource", { type: blob.type || "application/octet-stream" }));
    const resource = await request<LocalResource>("/api/resources", { method: "POST", body });
    options.onProgress?.(blob.size, blob.size);
    if (Object.keys(fields).length) await request(`/api/resources/${resource.id}`, { method: "PUT", body: JSON.stringify({ metadata: fields.metadata || {} }) });
    return localAsset(resource, fields);
}
export async function createTextCloudAsset(_input?: { title: string; content: string; metadata?: Record<string, unknown> }) { throw new Error("本地资源库不保存独立文本素材"); }
export async function saveCloudAsset(input: SaveCloudAssetInput) {
    if (input.sourceAssetId) return getCloudAsset(input.sourceAssetId);
    const response = await fetch(input.sourceUrl); if (!response.ok) throw new Error(`读取本地素材失败（${response.status}）`);
    return uploadCloudAsset(await response.blob(), input.kind, input.title, input);
}
export async function updateCloudAsset(id: string, patch: { title?: string; content?: string; metadata?: Record<string, unknown> }) {
    const resource = await request<LocalResource>(`/api/resources/${id}`, { method: "PUT", body: JSON.stringify(patch) }); return localAsset(resource);
}
export async function withAssetUrl(asset: CloudAsset) { if (asset.url) assetsByUrl.set(asset.url, asset); return asset; }
export async function getCloudAsset(id: string) { const resource = (await request<LocalResource[]>("/api/resources")).find((item) => item.id === id); if (!resource) throw new Error("本地资源不存在"); return localAsset(resource); }
export async function listCloudAssets() { return Promise.all((await request<LocalResource[]>("/api/resources")).map((resource) => localAsset(resource))); }
export async function listSharedCloudAssets() { return []; }
export async function setCloudAssetShared(id: string, _shared?: boolean) { return getCloudAsset(id); }
export async function unshareCloudAssetAsSuperuser(id: string) { return getCloudAsset(id); }
export async function deleteCloudAssets(ids: string[]) { await Promise.all(ids.map((id) => request(`/api/resources/${id}`, { method: "DELETE" }))); }

function localAsset(resource: LocalResource, fields: CloudAssetFields = {}): CloudAsset {
    const asset: CloudAsset = { id: resource.id, user_id: "local", kind: resource.type, title: resource.name, storage_path: resource.fileName, mime_type: resource.mimeType, byte_size: resource.size, width: fields.width || Number(resource.metadata?.width) || null, height: fields.height || Number(resource.metadata?.height) || null, duration_seconds: fields.duration_seconds || Number(resource.metadata?.duration) || null, metadata: { ...(resource.metadata || {}), source: resource.source }, created_at: resource.createdAt, updated_at: resource.createdAt, shared_at: null, url: resource.url };
    assetsByUrl.set(resource.url, asset); return asset;
}
async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers } }); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `本地资源请求失败（${response.status}）`); } return response.status === 204 ? undefined as T : response.json(); }
