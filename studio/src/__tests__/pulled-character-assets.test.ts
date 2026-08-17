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

  it("ignores unrelated and non-character resources", () => {
    const unrelated = resource("other-avatar", "image", "avatarUrl", "not-in-catalog");
    const upload = { ...resource("upload", "image", "avatarUrl"), source: "upload" };
    const [asset] = buildPulledCharacterAssets(catalog.slice(0, 1), [unrelated, upload]);

    expect(asset.pulled_resources).toEqual([]);
    expect(asset.reference_sheet?.selected_image_id).toBeNull();
  });

  it("marks only normalized catalog entries as pulled character assets", () => {
    const [asset] = buildPulledCharacterAssets(catalog.slice(0, 1), []);

    expect(isPulledCharacterAsset(asset)).toBe(true);
    expect(isPulledCharacterAsset({ id: "project-character" })).toBe(false);
    expect(isPulledCharacterAsset(null)).toBe(false);
  });
});
