import { describe, expect, it } from "vitest";
import {
  buildPulledCharacterAssets,
  isPulledCharacterAsset,
  type PulledCharacterCatalogEntry,
  type PulledCharacterResource,
} from "@/lib/pulledCharacterAssets";

const catalog: PulledCharacterCatalogEntry[] = [
  {
    id: "character-1",
    name: "Benny Stone",
    chineseName: "布爸",
    voiceId: "voice-benny",
    directory: "布爸",
  },
  {
    id: "character-2",
    name: "Squirrel",
    chineseName: "利利",
    voiceId: "voice-squirrel",
  },
];

function resource(
  id: string,
  type: PulledCharacterResource["type"],
  assetKey: string,
  characterId = "character-1",
): PulledCharacterResource {
  return {
    id,
    name: `布爸 · ${id}`,
    type,
    mimeType: type === "image" ? "image/png" : type === "video" ? "video/quicktime" : "audio/mpeg",
    size: 1024,
    fileName: `characters/布爸/${id}`,
    url: `/files/by-id/${id}`,
    createdAt: "2026-08-06T09:06:24.949+00:00",
    source: "character",
    metadata: { characterId, characterName: "布爸", assetKey },
  };
}

describe("buildPulledCharacterAssets", () => {
  it("returns one card per catalog character instead of one card per resource", () => {
    const assets = buildPulledCharacterAssets(catalog, [
      resource("full-body", "image", "fullBodyImageUrl"),
      resource("avatar", "image", "avatarUrl"),
      resource("idle-video", "video", "idleVideo1Url"),
      resource("voice-sample", "audio", "voiceSampleUrl"),
    ]);

    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      id: "character-1",
      name: "布爸",
      english_name: "Benny Stone",
      voice_id: "voice-benny",
      image_url: "/files/by-id/avatar",
      library_origin: "pulled-character",
    });
    expect(assets[0].pulled_resources).toHaveLength(4);
    expect(assets[0].reference_sheet?.image_variants).toHaveLength(2);
    expect(assets[1].pulled_resources).toEqual([]);
  });

  it("ignores unrelated and unlinked upload resources", () => {
    const unrelated = resource("other-avatar", "image", "avatarUrl", "not-in-catalog");
    const upload = { ...resource("upload", "image", "avatarUrl"), source: "upload" };
    const [asset] = buildPulledCharacterAssets(catalog.slice(0, 1), [unrelated, upload]);

    expect(asset.pulled_resources).toEqual([]);
    expect(asset.reference_sheet?.selected_image_id).toBeNull();
  });

  it("merges linked local images into the same gallery and honors the local primary image", () => {
    const local = {
      ...resource("local-portrait", "image", "localImage"),
      source: "upload",
      metadata: {
        characterLibraryCharacterIds: ["character-1"],
        characterAssetOrigin: "upload" as const,
      },
    };
    const [asset] = buildPulledCharacterAssets(
      [{ ...catalog[0], primaryResourceId: "local-portrait" }],
      [resource("avatar", "image", "avatarUrl"), local],
    );

    expect(asset.pulled_resources).toHaveLength(2);
    expect(asset.reference_sheet?.selected_image_id).toBe("local-portrait");
    expect(asset.image_url).toBe("/files/by-id/local-portrait");
  });

  it("merges linked local video and audio into the character resource groups", () => {
    const localVideo = {
      ...resource("local-video", "video", "localVideo"),
      source: "upload",
      metadata: {
        characterLibraryCharacterIds: ["character-1"],
        characterAssetOrigin: "upload" as const,
      },
    };
    const localAudio = {
      ...resource("local-audio", "audio", "localAudio"),
      source: "upload",
      metadata: {
        characterLibraryCharacterIds: ["character-1"],
        characterAssetOrigin: "upload" as const,
      },
    };
    const [asset] = buildPulledCharacterAssets(catalog.slice(0, 1), [localVideo, localAudio]);

    expect(asset.pulled_resources.map((item) => item.id).sort()).toEqual(["local-audio", "local-video"]);
    expect(asset.reference_sheet?.image_variants).toEqual([]);
  });

  it("marks only normalized catalog entries as pulled character assets", () => {
    const [asset] = buildPulledCharacterAssets(catalog.slice(0, 1), []);

    expect(isPulledCharacterAsset(asset)).toBe(true);
    expect(isPulledCharacterAsset({ id: "project-character" })).toBe(false);
    expect(isPulledCharacterAsset(null)).toBe(false);
  });
});
