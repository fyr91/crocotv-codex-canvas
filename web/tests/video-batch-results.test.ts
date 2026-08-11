import assert from "node:assert/strict";
import test from "node:test";

test("video assets are returned in output order", async () => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-key";
    const { videoResultsFromAssets } = await import("../src/services/api/video.ts");
    const results = videoResultsFromAssets([
        { id: "c", kind: "video", title: "c", storage_path: null, mime_type: "video/mp4", byte_size: 3, output_index: 2, url: "c" },
        { id: "a", kind: "video", title: "a", storage_path: null, mime_type: "video/mp4", byte_size: 1, output_index: 0, url: "a" },
        { id: "b", kind: "video", title: "b", storage_path: null, mime_type: "video/mp4", byte_size: 2, output_index: 1, url: "b" },
    ]);
    assert.deepEqual(results.map((item) => item.url), ["a", "b", "c"]);
    assert.deepEqual(results.map((item) => item.outputIndex), [0, 1, 2]);
});
