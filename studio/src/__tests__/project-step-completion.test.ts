import { describe, expect, it } from "vitest";
import { areCastAssetsComplete, isScriptStepComplete } from "@/lib/projectStepCompletion";
import type { Character, Prop, Scene } from "@/store/projectStore";

const generatedAsset = {
  selected_id: "selected",
  variants: [{ id: "selected", url: "/files/generated.png", created_at: 1 }],
};

describe("areCastAssetsComplete", () => {
  it("does not complete an empty entity list", () => {
    expect(areCastAssetsComplete([], [], [])).toBe(false);
  });

  it("does not count a reference-only entity as generated", () => {
    const character: Character = {
      id: "character",
      name: "Character",
      reference_image_url: "/files/reference.png",
    };
    expect(areCastAssetsComplete([character], [], [])).toBe(false);
  });

  it("does not complete until every entity has a selected result", () => {
    const character: Character = { id: "character", name: "Character", image_asset: generatedAsset };
    const scene: Scene = { id: "scene", name: "Scene", description: "", image_asset: generatedAsset };
    const prop: Prop = { id: "prop", name: "Prop", description: "" };
    expect(areCastAssetsComplete([character], [scene], [prop])).toBe(false);
  });

  it("completes when every entity has a selected usable result", () => {
    const character: Character = { id: "character", name: "Character", image_asset: generatedAsset };
    const scene: Scene = { id: "scene", name: "Scene", description: "", image_asset: generatedAsset };
    const prop: Prop = { id: "prop", name: "Prop", description: "", image_asset: generatedAsset };
    expect(areCastAssetsComplete([character], [scene], [prop])).toBe(true);
  });

  it("does not count a selected placeholder before generation has a URL", () => {
    const character: Character = {
      id: "character",
      name: "Character",
      image_asset: { selected_id: "pending", variants: [{ id: "pending", url: "", created_at: 1 }] },
    };
    expect(areCastAssetsComplete([character], [], [])).toBe(false);
  });
});

describe("isScriptStepComplete", () => {
  it("completes only after extraction against the current saved script", () => {
    expect(isScriptStepComplete(false, false)).toBe(true);
    expect(isScriptStepComplete(true, false)).toBe(false);
    expect(isScriptStepComplete(undefined, false)).toBe(false);
  });

  it("clears immediately while the editor has unsaved changes", () => {
    expect(isScriptStepComplete(false, true)).toBe(false);
  });
});
