import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../src/services/api/video.ts", import.meta.url), "utf8");
const generate = readFileSync(new URL("../../supabase/functions/generate/index.ts", import.meta.url), "utf8");
const dispatcher = readFileSync(new URL("../../supabase/functions/dispatch-video-generations/index.ts", import.meta.url), "utf8");
const ark = readFileSync(new URL("../../supabase/functions/_shared/providers/ark.ts", import.meta.url), "utf8");

test("video requests persist the selected input mode", () => {
    assert.match(client, /videoInputMode: config\.videoInputMode/);
    assert.match(generate, /validateVideoInputMode/);
    assert.match(dispatcher, /validateVideoInputMode/);
});

test("Ark maps frame images to dedicated roles", () => {
    assert.match(ark, /first_frame/);
    assert.match(ark, /last_frame/);
    assert.match(ark, /reference_image/);
});
