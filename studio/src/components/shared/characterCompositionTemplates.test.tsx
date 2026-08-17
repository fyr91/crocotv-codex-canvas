import { describe, expect, it } from "vitest";
import {
  appendEnglishCompositionTag,
  buildCharacterCompositionPrompt,
  CHARACTER_COMPOSITION_TEMPLATES,
  COMPOSITION_QUICK_TAGS,
  GPT_IMAGE_02_MODEL_ID,
} from "./characterCompositionTemplates";

describe("characterCompositionTemplates", () => {
  it("keeps every character composition generic and reusable", () => {
    const character = { name: "小林", description: "一位森林向导" };

    for (const template of Object.keys(CHARACTER_COMPOSITION_TEMPLATES) as Array<keyof typeof CHARACTER_COMPOSITION_TEMPLATES>) {
      const prompt = buildCharacterCompositionPrompt(character, template);
      expect(prompt).toContain("小林");
      expect(prompt).toContain("一位森林向导");
      expect(prompt).toContain("Composition:");
      expect(prompt.toLowerCase()).not.toContain("cyberpunk");
    }
  });

  it("requires GPT Image 02 for the character design sheet", () => {
    expect(CHARACTER_COMPOSITION_TEMPLATES.design_sheet.requiredModelId).toBe(GPT_IMAGE_02_MODEL_ID);
  });

  it("keeps localized quick-tag labels separate from English prompt values", () => {
    expect(COMPOSITION_QUICK_TAGS.character[0]).toEqual({ labelKey: "quickTagFullBody", value: "full body" });
    expect(appendEnglishCompositionTag("character portrait", COMPOSITION_QUICK_TAGS.character[0].value)).toBe("character portrait, full body");
  });
});
