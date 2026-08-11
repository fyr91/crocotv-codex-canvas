import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { supportsMiniMaxH3HdDimensions, supportsMiniMaxH3HdRepair } from "./minimax-h3-enhancement";

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
