import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { addResources, atomicJson, fileSize, readJson, resourcesDir, typeFromMime } from "./storage";
import type { CharacterEntry, StoredResource } from "./types";

const charactersDir = path.join(resourcesDir, "characters");
const indexPath = path.join(charactersDir, "index.json");

type Catalog = {
  schemaVersion: number;
  publishVersion: { id: string; name: string; activatedAt: string };
  catalogFingerprint?: string;
  characters: Array<Record<string, any>>;
};

export async function listCharacters(): Promise<CharacterEntry[]> {
  const index = await readJson<{ characters: any[] }>(indexPath, { characters: [] });
  const resources = await import("./storage").then((module) => module.listResources());
  return index.characters.filter((item) => item.tts_voice_id).map((item) => {
    const avatar = resources.find((resource) => resource.source === "character" && resource.type === "image" && resource.metadata?.characterId === item.id);
    return { id: item.id, name: item.name, chineseName: item.chinese_name, voiceId: item.tts_voice_id, directory: item.directory, avatarUrl: avatar?.url };
  });
}

export async function syncCharacters() {
  const apiUrl = String(process.env.CROCO_CHARACTERS_API_URL || "").trim();
  const token = String(process.env.CROCO_CHARACTERS_API_TOKEN || "").trim();
  if (!apiUrl || !token) throw new Error("请在 .env 中填写 CROCO_CHARACTERS_API_URL、CROCO_CHARACTERS_API_TOKEN");
  const response = await fetch(apiUrl, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`角色目录同步失败（${response.status}）：${(await response.text()).slice(0, 200)}`);
  const catalog = await response.json() as Catalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.characters)) throw new Error("角色目录返回了不支持的数据结构");
  await mkdir(charactersDir, { recursive: true });
  const previous = await readJson<{ characters: any[] }>(indexPath, { characters: [] });
  const previousById = new Map(previous.characters.map((item) => [item.id, item]));
  const result = { added: 0, updated: 0, unchanged: 0, assetsDownloaded: 0 };
  const entries: any[] = [];
  const resourceEntries: Omit<StoredResource, "url">[] = [];

  for (const character of catalog.characters) {
    const known = previousById.get(character.id);
    const directory = safeSegment(known?.directory || character.chineseName || character.name);
    const characterDir = path.join(charactersDir, directory);
    const characterFile = path.join(characterDir, "character.json");
    const existed = await exists(characterFile);
    let changed = false;
    await mkdir(path.join(characterDir, "character-sheet"), { recursive: true });
    for (const asset of character.assets || []) {
      const relative = safeRelative(asset.relativePath);
      const target = path.join(characterDir, "assets", ...relative.split("/"));
      if (!await validLocalAsset(target, asset)) {
        await downloadVerified(asset, target);
        result.assetsDownloaded += 1;
        changed = true;
      }
      const mime = asset.mimeType || mimeFromName(target);
      const resourceId = `character-${character.id}-${createHash("sha256").update(asset.key || relative).digest("hex").slice(0, 18)}`;
      resourceEntries.push({ id: resourceId, name: `${character.chineseName || character.name} · ${path.basename(relative)}`, type: typeFromMime(mime), mimeType: mime, size: await fileSize(target), fileName: path.relative(resourcesDir, target).split(path.sep).join("/"), createdAt: catalog.publishVersion.activatedAt || new Date().toISOString(), source: "character", metadata: { characterId: character.id, characterName: character.chineseName || character.name, assetKey: asset.key } });
    }
    const managed = {
      id: character.id, name: character.name, chinese_name: character.chineseName, subtitle: character.subtitle, summary: character.summary,
      voice: { tts_voice_id: character.voice?.ttsVoiceId ?? null, livechat_speaker_id: character.voice?.livechatSpeakerId ?? null },
      publication: { version_id: catalog.publishVersion.id, version_name: catalog.publishVersion.name, activated_at: catalog.publishVersion.activatedAt },
      prompt_file: "prompts/final-prompt.md", asset_manifest_file: "assets/manifest.json",
    };
    if (await writeIfChanged(characterFile, `${JSON.stringify(managed, null, 2)}\n`)) changed = true;
    if (await writeIfChanged(path.join(characterDir, "prompts", "final-prompt.md"), `${character.prompt || ""}${String(character.prompt || "").endsWith("\n") ? "" : "\n"}`)) changed = true;
    const manifest = { character_id: character.id, character: character.chineseName, source: "CrocoBackend current publish version", assets: (character.assets || []).map((asset: any) => ({ key: asset.key, relative_path: safeRelative(asset.relativePath), sha256: asset.sha256 ?? null, mime_type: asset.mimeType ?? null, byte_size: asset.byteSize ?? null })) };
    if (await writeIfChanged(path.join(characterDir, "assets", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)) changed = true;
    if (!existed) result.added += 1; else if (changed) result.updated += 1; else result.unchanged += 1;
    entries.push({ id: character.id, name: character.name, chinese_name: character.chineseName, subtitle: character.subtitle, tts_voice_id: character.voice?.ttsVoiceId ?? null, directory, asset_count: (character.assets || []).length });
  }
  const currentIds = new Set(entries.map((entry) => entry.id));
  const preserved = previous.characters.filter((entry) => !currentIds.has(entry.id));
  await atomicJson(indexPath, { source: { publish_version_id: catalog.publishVersion.id, publish_version_name: catalog.publishVersion.name, activated_at: catalog.publishVersion.activatedAt, catalog_fingerprint: catalog.catalogFingerprint }, character_count: entries.length, characters: [...entries, ...preserved] });
  await addResources(resourceEntries);
  return { publishVersion: catalog.publishVersion, remoteCharacters: catalog.characters.length, ...result };
}

async function validLocalAsset(target: string, asset: any) {
  try {
    const info = await stat(target);
    if (asset.byteSize != null && info.size !== Number(asset.byteSize)) return false;
    if (asset.sha256) return createHash("sha256").update(await readFile(target)).digest("hex").toLowerCase() === String(asset.sha256).toLowerCase();
    return true;
  } catch { return false; }
}

async function downloadVerified(asset: any, target: string) {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`角色资源下载失败（${response.status}）：${asset.key}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (asset.byteSize != null && bytes.length !== Number(asset.byteSize)) throw new Error(`角色资源大小校验失败：${asset.key}`);
  if (asset.sha256 && createHash("sha256").update(bytes).digest("hex").toLowerCase() !== String(asset.sha256).toLowerCase()) throw new Error(`角色资源 SHA-256 校验失败：${asset.key}`);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

async function writeIfChanged(target: string, content: string) {
  try { if (await readFile(target, "utf8") === content) return false; } catch {}
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, target);
  return true;
}

function safeSegment(value: unknown) { const segment = String(value || "").trim(); if (!segment || segment === "." || segment === ".." || /[\\/\0]/.test(segment)) throw new Error("非法角色目录名"); return segment; }
function safeRelative(value: unknown) { const result = path.posix.normalize(String(value || "")); if (!result || result.startsWith("../") || result.startsWith("/") || result.includes("\\")) throw new Error("非法角色资源路径"); return result; }
function mimeFromName(value: string) { const ext = path.extname(value).toLowerCase(); return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav" } as Record<string, string>)[ext] || "application/octet-stream"; }
async function exists(target: string) { try { await access(target); return true; } catch { return false; } }
