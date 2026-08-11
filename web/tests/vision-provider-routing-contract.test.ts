import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generate = readFileSync(new URL("../../supabase/functions/generate/index.ts", import.meta.url), "utf8");
const generations = readFileSync(new URL("../../supabase/functions/_shared/generations.ts", import.meta.url), "utf8");
const gemini = readFileSync(new URL("../../supabase/functions/_shared/providers/gemini.ts", import.meta.url), "utf8");
const image = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");

test("Gemini image inputs use the native multimodal provider path", () => {
    assert.match(generate, /runtime\.model\.provider_id === "gemini" && signedMedia\.length/);
    assert.doesNotMatch(generate, /signedMedia\.some\(\(item\) => item\.kind === "video" \|\| item\.kind === "audio"\)/);
    assert.match(gemini, /const structured = ctx\.params\.splitCount != null/);
});

test("GLM receives temporary JPEG or PNG overrides for unsupported browser image formats", () => {
    assert.match(image, /providerIdForModel\(model\) === "bigmodel"/);
    assert.match(image, /inputImageOverrides/);
    assert.match(generations, /decodeProviderImageOverride/);
    assert.match(generations, /image\/jpeg\|image\/png/);
});
