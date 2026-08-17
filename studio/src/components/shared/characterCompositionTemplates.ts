export type CharacterCompositionTemplate = "simple" | "detailed" | "design_sheet";

export const GPT_IMAGE_02_MODEL_ID = "openai:gpt-image@2";

export const CHARACTER_COMPOSITION_TEMPLATES: Record<CharacterCompositionTemplate, {
  labelKey: "tplSimpleLabel" | "tplDetailedLabel" | "tplDesignSheetLabel";
  descKey: "tplSimpleDesc" | "tplDetailedDesc" | "tplDesignSheetDesc";
  compositionEn: string;
  negativeAppend: string;
  exampleImage: string;
  requiredModelId?: string;
}> = {
  simple: {
    labelKey: "tplSimpleLabel",
    descKey: "tplSimpleDesc",
    compositionEn: "Composition: character reference sheet, single unified image, seamless layout without borders or frames, clean neutral background. Left half: a large head-and-shoulders close-up portrait with a clear front-facing view and faithful facial details. Right half: three equally sized full-body standing views arranged side by side (front, side, back), head-to-toe fully visible in a relaxed neutral pose. Preserve the same identity, age, body proportions, hairstyle, outfit, materials, accessories, and color palette in every view. Use consistent soft studio lighting, clean silhouettes, and even illumination.",
    negativeAppend: "text, labels, watermark, UI overlay, panel borders, frames, separate unrelated images, inconsistent identity, inconsistent outfit, cropped body, duplicate limbs, distorted anatomy",
    exampleImage: "/assets/templates/simple-triview.png",
  },
  detailed: {
    labelKey: "tplDetailedLabel",
    descKey: "tplDetailedDesc",
    compositionEn: "Composition: detailed character reference sheet, single unified image, seamless layout without borders or frames, clean neutral background. Left section: three full-body standing views arranged side by side (front, side, back), head-to-toe visible with consistent anatomy and clothing construction. Upper right: one large face close-up with faithful facial structure, skin, hair, and defining features. Lower right: three smaller head studies from front, three-quarter, and profile angles, plus concise close-up studies of only the outfit materials, accessories, or physical details already described for this character. Preserve the same identity, proportions, hairstyle, costume, materials, accessories, and palette across every view. Use consistent soft studio lighting and even illumination.",
    negativeAppend: "text, labels, watermark, UI overlay, panel borders, frames, separate unrelated images, invented costume elements, inconsistent identity, inconsistent outfit, cropped body, duplicate limbs, distorted anatomy",
    exampleImage: "/assets/templates/detailed-reference.png",
  },
  design_sheet: {
    labelKey: "tplDesignSheetLabel",
    descKey: "tplDesignSheetDesc",
    compositionEn: "Composition: professional character design sheet, single unified image with a clean presentation background that complements the character without introducing new story elements. Preserve the character's identity, age, anatomy, body proportions, hairstyle, outfit, materials, accessories, and color palette across every panel. Layout: upper left, a large hero bust portrait in a three-quarter view; center, three full-body turnaround views (front, side, back), head-to-toe visible; upper right, four expression close-ups appropriate to the character's established personality (neutral, warm, focused, intense) without changing facial identity; lower left, three or four detail callouts selected only from the described clothing construction, materials, accessories, or distinctive physical features; lower right, a compact character specification area using only the provided name and attributes, with no invented lore. High-detail professional concept-art presentation, coherent lighting, crisp readable layout, and consistent rendering throughout.",
    negativeAppend: "watermark, signature, unrelated props, invented lore, invented costume elements, inconsistent identity, inconsistent outfit, cropped turnaround views, duplicate limbs, distorted anatomy, separate unrelated images, low quality",
    exampleImage: "/assets/templates/design-sheet.png",
    requiredModelId: GPT_IMAGE_02_MODEL_ID,
  },
};

export const COMPOSITION_QUICK_TAGS = {
  character: [
    { labelKey: "quickTagFullBody", value: "full body" },
    { labelKey: "quickTagCloseUp", value: "close-up" },
    { labelKey: "quickTagThreeView", value: "three-view" },
    { labelKey: "quickTagDynamicPose", value: "dynamic pose" },
    { labelKey: "quickTagSoftLighting", value: "soft lighting" },
    { labelKey: "quickTagStudioLighting", value: "studio lighting" },
    { labelKey: "quickTagWhiteBackground", value: "white background" },
    { labelKey: "quickTagDetailedFace", value: "detailed face" },
  ],
  scene: [
    { labelKey: "quickTagWideAngle", value: "wide angle" },
    { labelKey: "quickTagEstablishingShot", value: "establishing shot" },
    { labelKey: "quickTagGoldenHour", value: "golden hour" },
    { labelKey: "quickTagDramaticLighting", value: "dramatic lighting" },
    { labelKey: "quickTagAerialView", value: "aerial view" },
    { labelKey: "quickTagDepthOfField", value: "depth of field" },
    { labelKey: "quickTagAtmospheric", value: "atmospheric" },
    { labelKey: "quickTagCinematic", value: "cinematic" },
  ],
  prop: [
    { labelKey: "quickTagProductShot", value: "product shot" },
    { labelKey: "quickTagWhiteBackground", value: "white background" },
    { labelKey: "quickTagMultiAngle", value: "multi-angle" },
    { labelKey: "quickTagStudioLighting", value: "studio lighting" },
    { labelKey: "quickTagMacroDetail", value: "macro detail" },
    { labelKey: "quickTagFloating", value: "floating" },
    { labelKey: "quickTagTransparentBackground", value: "transparent background" },
    { labelKey: "quickTagClean", value: "clean" },
  ],
} as const;

export function buildCharacterCompositionPrompt(character: { name?: string; description?: string; english_name?: string }, template: CharacterCompositionTemplate) {
  const identity = [character.name, character.description || character.english_name].filter(Boolean).join("，");
  return `${identity}\n\n${CHARACTER_COMPOSITION_TEMPLATES[template].compositionEn}`.trim();
}

export function characterCompositionNegative(template: CharacterCompositionTemplate) {
  return CHARACTER_COMPOSITION_TEMPLATES[template].negativeAppend;
}

export function appendEnglishCompositionTag(prompt: string, value: string) {
  const current = prompt.trimEnd();
  if (!current) return value;
  return `${current}${current.endsWith(",") || current.endsWith("，") ? " " : ", "}${value}`;
}
