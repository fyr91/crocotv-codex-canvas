import type { Character, ImageAsset, Prop, Scene } from "@/store/projectStore";

export function isScriptStepComplete(
  entityExtractionStale: boolean | undefined,
  editorDirty: boolean,
): boolean {
  return entityExtractionStale === false && !editorDirty;
}

function hasSelectedImage(asset?: ImageAsset): boolean {
  if (!asset?.selected_id) return false;
  const selected = asset.variants?.find((variant) => variant.id === asset.selected_id);
  return Boolean(selected?.url?.trim());
}

function hasSelectedCharacterImage(character: Character): boolean {
  const sheet = character.reference_sheet;
  if (sheet?.selected_image_id) {
    const selected = sheet.image_variants?.find(
      (variant) => variant.id === sheet.selected_image_id,
    );
    if (selected?.url?.trim()) return true;
  }

  return hasSelectedImage(character.image_asset)
    || hasSelectedImage(character.full_body_asset);
}

/**
 * Cast & Assets is complete only when at least one extracted entity exists and
 * every character, scene, and prop has a selected, usable visual result.
 * Reference-only uploads deliberately do not satisfy this check.
 */
export function areCastAssetsComplete(
  characters: Character[],
  scenes: Scene[],
  props: Prop[],
): boolean {
  const entities = [
    ...characters.map((entity) => ({ kind: "character" as const, entity })),
    ...scenes.map((entity) => ({ kind: "scene" as const, entity })),
    ...props.map((entity) => ({ kind: "prop" as const, entity })),
  ];

  return entities.length > 0 && entities.every(({ kind, entity }) => {
    if (kind === "character") return hasSelectedCharacterImage(entity);
    return hasSelectedImage(entity.image_asset);
  });
}
