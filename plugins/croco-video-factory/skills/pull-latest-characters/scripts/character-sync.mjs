import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function configFromEnv(env, pipelineRoot = process.cwd()) {
  if (!env.CROCO_CHARACTERS_API_URL) throw new Error('Missing CROCO_CHARACTERS_API_URL');
  if (!env.CROCO_CHARACTERS_API_TOKEN) throw new Error('Missing CROCO_CHARACTERS_API_TOKEN');
  return {
    apiUrl: env.CROCO_CHARACTERS_API_URL,
    token: env.CROCO_CHARACTERS_API_TOKEN,
    charactersDir: path.resolve(pipelineRoot, env.CROCO_CHARACTERS_DIR || './characters'),
  };
}

export async function fetchCharacterCatalog({ apiUrl, token }, fetchImpl = fetch) {
  const response = await fetchImpl(apiUrl, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Character catalog request failed (${response.status}): ${detail}`);
  }
  const catalog = await response.json();
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.characters)) {
    throw new Error('Character catalog response has an unsupported schema');
  }
  return catalog;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeIfChanged(filePath, content) {
  let current = null;
  try {
    current = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === content) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
  return true;
}

function safeSegment(value) {
  const segment = String(value ?? '').trim();
  if (!segment || segment === '.' || segment === '..' || /[\\/\0]/.test(segment)) {
    throw new Error(`Invalid character directory name: ${segment || '(empty)'}`);
  }
  return segment;
}

function safeRelativePath(value) {
  const normalized = path.posix.normalize(String(value ?? ''));
  if (!normalized || normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('\\')) {
    throw new Error(`Invalid asset path: ${value}`);
  }
  return normalized;
}

async function discoverDirectoriesById(charactersDir, index) {
  const byId = new Map((index?.characters ?? []).filter((item) => item.id && item.directory).map((item) => [item.id, item.directory]));
  let entries = [];
  try {
    entries = await readdir(charactersDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const character = await readJson(path.join(charactersDir, entry.name, 'character.json'), null);
    if (character?.id && !byId.has(character.id)) byId.set(character.id, entry.name);
  }
  return byId;
}

function managedFiles(character, catalog) {
  const publication = {
    version_id: catalog.publishVersion.id,
    version_name: catalog.publishVersion.name,
    activated_at: catalog.publishVersion.activatedAt,
    soul_version: character.source.soulPublished?.soul_version ?? null,
    soul_published_at: character.source.soulPublished?.published_at ?? null,
  };
  return new Map([
    ['character.json', json({
      id: character.id,
      name: character.name,
      chinese_name: character.chineseName,
      subtitle: character.subtitle,
      summary: character.summary,
      category_domain: character.categoryDomain,
      sort_order: character.sortOrder,
      voice: {
        tts_voice_id: character.voice?.ttsVoiceId ?? null,
        livechat_speaker_id: character.voice?.livechatSpeakerId ?? null,
      },
      publication,
      prompt_file: 'prompts/final-prompt.md',
      asset_manifest_file: 'assets/manifest.json',
      config_files: {
        asset: 'configs/asset-config.json',
        skill: 'configs/skill-config.json',
        capability_profile: 'configs/capability-profile.json',
        intro_profile: 'configs/intro-profile.json',
        home_avatar_audio: 'configs/home-avatar-audio.json',
      },
    })],
    ['prompts/final-prompt.md', `${character.prompt ?? ''}${String(character.prompt ?? '').endsWith('\n') ? '' : '\n'}`],
    ['configs/asset-config.json', json(character.configs?.asset ?? null)],
    ['configs/skill-config.json', json(character.configs?.skill ?? null)],
    ['configs/capability-profile.json', json(character.configs?.capability ?? null)],
    ['configs/intro-profile.json', json(character.configs?.intro ?? null)],
    ['configs/home-avatar-audio.json', json(character.configs?.homeAvatarAudio ?? null)],
    ['source/publish-item.json', json(character.source?.publishItem ?? null)],
    ['source/soul-published.json', json(character.source?.soulPublished ?? null)],
  ]);
}

function manifestAsset(asset) {
  return {
    key: asset.key,
    relative_path: safeRelativePath(asset.relativePath),
    source_url: asset.url,
    source_fields: asset.sourceFields ?? [],
    delivery_ref_id: asset.deliveryRefId ?? null,
    revision: asset.revision ?? null,
    sha256: asset.sha256 ?? null,
    mime_type: asset.mimeType ?? null,
    byte_size: asset.byteSize ?? null,
    media: asset.media ?? null,
  };
}

function assetUnchanged(asset, previous, fileInfo) {
  if (!previous || !fileInfo) return false;
  if ((previous.source_url ?? previous.url) !== asset.url) return false;
  const previousSha = previous.sha256 ?? previous.media?.sha256 ?? null;
  const previousRevision = previous.revision ?? previous.media?.delivery_revision ?? null;
  if (asset.sha256 && previousSha !== asset.sha256) return false;
  if (asset.revision != null && String(previousRevision) !== String(asset.revision)) return false;
  if (asset.byteSize != null && Number(fileInfo.size) !== Number(asset.byteSize)) return false;
  return true;
}

async function downloadAsset(asset, destination, fetchImpl) {
  const response = await fetchImpl(asset.url, { method: 'GET' });
  if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${asset.key}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (asset.byteSize != null && bytes.length !== Number(asset.byteSize)) {
    throw new Error(`Asset byte size mismatch: ${asset.key}`);
  }
  if (asset.sha256) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual.toLowerCase() !== String(asset.sha256).toLowerCase()) {
      throw new Error(`Asset SHA-256 mismatch: ${asset.key}`);
    }
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, destination);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function indexEntry(character, directory) {
  return {
    id: character.id,
    name: character.name,
    chinese_name: character.chineseName,
    subtitle: character.subtitle,
    category_domain: character.categoryDomain,
    tts_voice_id: character.voice?.ttsVoiceId ?? null,
    directory,
    asset_count: character.assets.length,
  };
}

export async function syncCharacterCatalog(catalog, {
  charactersDir,
  fetchImpl = fetch,
} = {}) {
  if (!charactersDir) throw new Error('charactersDir is required');
  await mkdir(charactersDir, { recursive: true });
  const indexPath = path.join(charactersDir, 'index.json');
  const previousIndex = await readJson(indexPath, { characters: [] });
  const directoriesById = await discoverDirectoriesById(charactersDir, previousIndex);
  const result = { added: 0, updated: 0, unchanged: 0, assetsDownloaded: 0 };
  const currentEntries = [];

  for (const character of catalog.characters) {
    const knownDirectory = directoriesById.get(character.id);
    const directory = safeSegment(knownDirectory ?? character.chineseName ?? character.name);
    const characterDir = path.join(charactersDir, directory);
    const existed = await exists(path.join(characterDir, 'character.json'));
    const characterSheetDir = path.join(characterDir, 'character-sheet');
    const previousManifest = await readJson(path.join(characterDir, 'assets', 'manifest.json'), { assets: [] });
    const previousAssets = new Map((previousManifest.assets ?? []).map((asset) => [asset.key, asset]));
    let changed = false;

    if (!await exists(characterSheetDir)) {
      await mkdir(characterSheetDir, { recursive: true });
      changed = true;
    }

    for (const asset of character.assets) {
      const relativePath = safeRelativePath(asset.relativePath);
      const destination = path.join(characterDir, 'assets', ...relativePath.split('/'));
      let fileInfo = null;
      try { fileInfo = await stat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!assetUnchanged(asset, previousAssets.get(asset.key), fileInfo)) {
        await downloadAsset(asset, destination, fetchImpl);
        result.assetsDownloaded += 1;
        changed = true;
      }
    }

    for (const [relativePath, content] of managedFiles(character, catalog)) {
      if (await writeIfChanged(path.join(characterDir, relativePath), content)) changed = true;
    }
    const manifest = {
      soul_id: character.id,
      character: character.chineseName,
      source: 'CrocoBackend current publish version',
      asset_count: character.assets.length,
      downloaded: true,
      assets: character.assets.map(manifestAsset),
    };
    if (await writeIfChanged(path.join(characterDir, 'assets', 'manifest.json'), json(manifest))) changed = true;

    if (!existed) result.added += 1;
    else if (changed) result.updated += 1;
    else result.unchanged += 1;
    currentEntries.push(indexEntry(character, directory));
  }

  const currentIds = new Set(currentEntries.map((entry) => entry.id));
  const preservedLocalEntries = (previousIndex.characters ?? []).filter((entry) => !currentIds.has(entry.id));
  const nextIndex = {
    source: {
      supabase_project: 'CrocoBackend',
      project_id: 'sbwaergjomvcmtivcxer',
      publish_version_id: catalog.publishVersion.id,
      publish_version_name: catalog.publishVersion.name,
      activated_at: catalog.publishVersion.activatedAt,
      catalog_fingerprint: catalog.catalogFingerprint,
    },
    character_count: currentEntries.length,
    characters: [...currentEntries, ...preservedLocalEntries],
  };
  await writeIfChanged(indexPath, json(nextIndex));
  return result;
}
