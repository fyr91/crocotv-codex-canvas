import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { createMiniMaxH3Enhancement, getMiniMaxH3Enhancement, supportsMiniMaxH3HdDimensions, supportsMiniMaxH3HdRepair } from "./minimax-h3-enhancement";

test("MiniMax H3 480p quality profiles support one-click HD repair", () => {
    assert.equal(supportsMiniMaxH3HdRepair("minimax_h3", "standard_480p"), true);
    assert.equal(supportsMiniMaxH3HdRepair("minimax_h3", "standard_portrait_480p"), true);
    assert.equal(supportsMiniMaxH3HdRepair("minimax_h3", "standard_768p"), false);
    assert.equal(supportsMiniMaxH3HdRepair("ltx", "standard_480p"), false);
});

test("all four MiniMax H3 480p output dimensions support HD repair", () => {
    for (const [width, height] of [[864, 480], [640, 480], [480, 864], [480, 640]]) {
        assert.equal(supportsMiniMaxH3HdDimensions("minimax_h3", width, height), true);
    }
    assert.equal(supportsMiniMaxH3HdDimensions("minimax_h3", 1280, 720), false);
    assert.equal(supportsMiniMaxH3HdDimensions("ltx", 864, 480), false);
});

test("FlashVSR 高清修复通过本地成都调度适配接口创建和查询", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json({ enhancement: { id: "flash-job", source_resource_id: "source-1", status: "queued", stage: "queued", progress: 0 } });
    }) as typeof fetch;
    try {
        const created = await createMiniMaxH3Enhancement("source-1");
        const queried = await getMiniMaxH3Enhancement("source-1");
        assert.equal(created.source_asset_id, "source-1");
        assert.equal(queried?.id, "flash-job");
        assert.equal(calls[0].url, "/api/gpu/enhancements");
        assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { sourceResourceId: "source-1" });
        assert.equal(calls[1].url, "/api/gpu/enhancements/source-1");
    } finally {
        globalThis.fetch = originalFetch;
    }
});
