import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./canvas-music-settings-panel.tsx", import.meta.url), "utf8");

describe("CanvasMusicSettingsPanel field semantics", () => {
    it("does not wrap editable fields and copy buttons in a label", () => {
        const field = source.match(/function Field[\s\S]*?\n}\n/);
        expect(field?.[0]).toContain('return <div className="block">');
        expect(field?.[0]).not.toContain("<label");
    });
});
