import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { normalizeVideoGenerationOptions } from "@/lib/video-generation-options";
import { getModelCatalog } from "./model-catalog";

test("Canvas 模型目录固定随代码发布且包含全部 GPU 能力", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("不应请求远端模型目录"));
    try {
        const models = await getModelCatalog();
        assert.deepEqual(models.filter((model) => ["ernie-image-turbo", "minimax-h3", "ltx-2.5"].includes(model.model_key)).map((model) => model.model_key), ["ernie-image-turbo", "minimax-h3", "ltx-2.5"]);
        assert.equal(fetchSpy.mock.calls.length, 0);
        const ltx = models.find((model) => model.model_key === "ltx-2.5");
        assert.ok(ltx);
        const options = normalizeVideoGenerationOptions("ltx", ltx.config, { inputMode: "text", duration: "5", count: 1 });
        assert.equal(options.error, undefined);
        assert.equal(options.selection.size, "1280x704");
        assert.deepEqual(options.durations, [3, 5, 10, 15, 20]);
        assert.deepEqual(options.counts, [1, 2, 3]);
    } finally {
        fetchSpy.mockRestore();
    }
});
