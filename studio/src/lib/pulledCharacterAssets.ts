import type { Character, ImageVariant } from "@/store/projectStore";

export interface PulledCharacterCatalogEntry {
  id: string;
  name: string;
  chineseName?: string;
  voiceId?: string;
  directory?: string;
  avatarUrl?: string;
  primaryResourceId?: string;
}

export interface PulledCharacterResource {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "file";
  mimeType: string;
  size: number;
  fileName: string;
  url: string;
  createdAt: string;
  source: string;
  metadata?: {
    characterId?: string;
    characterName?: string;
    assetKey?: string;
    characterLibraryCharacterIds?: string[];
    characterAssetOrigin?: "upload" | "generated" | "agent";
    [key: string]: unknown;
  };
}

/**
 * Studio 资产库中的同步角色视图。它引用统一资源库，并允许用本地图片、视频和音频扩充角色；
 * 仍然不复制文件，也不写入具体项目。
 */
export interface PulledCharacterAsset extends Character {
  library_origin: "pulled-character";
  english_name?: string;
  directory?: string;
  pulled_resources: PulledCharacterResource[];
}

export function isPulledCharacterAsset(
  asset: unknown,
): asset is PulledCharacterAsset {
  return typeof asset === "object" && asset !== null && "library_origin" in asset &&
    asset.library_origin === "pulled-character";
}

function createdAtSeconds(resource: PulledCharacterResource): number {
  const milliseconds = Date.parse(resource.createdAt);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : 0;
}

function imageRank(resource: PulledCharacterResource): number {
  const assetKey = resource.metadata?.assetKey;
  if (assetKey === "avatarUrl") return 0;
  if (assetKey === "fullBodyImageUrl") return 1;
  if (assetKey === "halfBodyImageUrl") return 2;
  if (assetKey === "chestImageUrl") return 3;
  return 4;
}

/**
 * 将角色目录与统一资源索引聚合为“一名角色一张卡片”。资源始终保留原 URL，
 * 因此 Studio 与 Canvas 看到的是同一份本地文件。
 */
export function buildPulledCharacterAssets(
  catalog: PulledCharacterCatalogEntry[],
  resources: PulledCharacterResource[],
): PulledCharacterAsset[] {
  const byCharacter = new Map<string, PulledCharacterResource[]>();
  for (const resource of resources) {
    const characterIds = new Set<string>();
    if (resource.source === "character" && resource.metadata?.characterId) characterIds.add(resource.metadata.characterId);
    if (resource.metadata?.characterAssetOrigin) {
      for (const characterId of resource.metadata.characterLibraryCharacterIds ?? []) characterIds.add(characterId);
    }
    characterIds.forEach((characterId) => {
      const entries = byCharacter.get(characterId) ?? [];
      entries.push(resource);
      byCharacter.set(characterId, entries);
    });
  }

  return catalog.map((entry) => {
    const characterResources = [...(byCharacter.get(entry.id) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "zh"),
    );
    const images = characterResources
      .filter((resource) => resource.type === "image")
      .sort((a, b) => Number(b.id === entry.primaryResourceId) - Number(a.id === entry.primaryResourceId)
        || imageRank(a) - imageRank(b)
        || a.name.localeCompare(b.name, "zh"));
    const variants: ImageVariant[] = images.map((resource) => ({
      id: resource.id,
      url: resource.url,
      created_at: createdAtSeconds(resource),
    }));
    const selectedImage = images.find((resource) => resource.id === entry.primaryResourceId) ?? images[0];
    const displayName = entry.chineseName?.trim() || entry.name;

    return {
      id: entry.id,
      name: displayName,
      description: entry.name !== displayName ? entry.name : undefined,
      english_name: entry.name !== displayName ? entry.name : undefined,
      directory: entry.directory,
      image_url: selectedImage?.url || entry.avatarUrl,
      avatar_url: selectedImage?.url || entry.avatarUrl,
      full_body_image_url: images.find((resource) => resource.metadata?.assetKey === "fullBodyImageUrl")?.url,
      reference_sheet: {
        selected_image_id: selectedImage?.id ?? null,
        image_variants: variants,
      },
      voice_id: entry.voiceId,
      starred: false,
      library_origin: "pulled-character",
      pulled_resources: characterResources,
    };
  });
}

export function pulledResourceCount(asset: Character): number | undefined {
  return isPulledCharacterAsset(asset) ? asset.pulled_resources.length : undefined;
}
