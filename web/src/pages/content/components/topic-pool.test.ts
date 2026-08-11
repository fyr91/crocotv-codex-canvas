import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("TopicPool card actions", () => {
    it("keeps a stable gap between tags and the claim action", () => {
        const source = readFileSync(new URL("./topic-pool.tsx", import.meta.url), "utf8");
        expect(source).toContain('className="mt-auto pt-4"');
        expect(source).toMatch(/<Button\s+block/);
    });

    it("uses the shared semantic theme for public Topic cards", () => {
        const source = readFileSync(new URL("./topic-pool.tsx", import.meta.url), "utf8");
        expect(source).toContain("bg-[var(--surface-raised)]");
        expect(source).not.toContain("bg-white");
        expect(source).not.toContain("dark:bg-stone-950");
    });
});
