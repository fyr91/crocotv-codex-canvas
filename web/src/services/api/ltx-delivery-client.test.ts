import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: mocks.maybeSingle }),
            }),
        }),
    },
}));

import { watchLtxDelivery } from "./ltx-delivery-client";

class StubEventSource {
    onerror: (() => void) | null = null;
    addEventListener() {}
    close() {}
}

describe("watchLtxDelivery", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("EventSource", StubEventSource);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ state: "waiting", outputs: [] }),
        }));
        mocks.maybeSingle.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("stops waiting when the persisted generation job has failed", async () => {
        mocks.maybeSingle.mockResolvedValue({
            data: { status: "failed", error_message: "LTX 提交失败" },
            error: null,
        });

        const result = watchLtxDelivery({
            mode: "ltx-direct-preview-v1",
            baseUrl: "https://ltx.example.com",
            externalJobId: "job-1",
            ticket: "ticket-1",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }, { expectedCount: 2 });

        await expect(result).rejects.toThrow("LTX 提交失败");
        expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    });
});
