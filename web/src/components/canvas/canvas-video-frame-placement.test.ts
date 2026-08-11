import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(componentDir, name), "utf8");

describe("视频首尾帧选择位置", () => {
    it("生成模组只在组装提示词面板展示首尾帧选择", () => {
        expect(source("canvas-config-node-panel.tsx")).not.toContain("CanvasVideoFrameFields");
        expect(source("canvas-config-composer.tsx")).toContain("<CanvasVideoFrameFields");
    });

    it("独立视频节点仍在自己的提示词面板展示首尾帧选择", () => {
        expect(source("canvas-node-prompt-panel.tsx")).toContain("<CanvasVideoFrameFields");
    });
});
