import { describe, expect, it, vi } from "vitest";
import { saveAs } from "file-saver";

import { readZip } from "@/lib/zip";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { canvasResultFileName, exportCanvasResultNodes, selectedCanvasResultNodes } from "./canvas-result-export";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

function node(id: string, type: CanvasNodeType, content?: string, mimeType?: string): CanvasNodeData {
    return {
        id,
        type,
        title: id === "image" ? "主视觉 / A" : id,
        position: { x: 0, y: 0 },
        width: 320,
        height: 240,
        metadata: content ? { content, mimeType, status: "success" } : { status: "idle" },
    };
}

describe("canvas result export", () => {
    it("keeps selected exportable results in canvas order and ignores groups or empty nodes", () => {
        const nodes = [
            node("image", CanvasNodeType.Image, "data:image/png;base64,AA==", "image/png"),
            node("group", CanvasNodeType.Group),
            node("empty-video", CanvasNodeType.Video),
            node("video", CanvasNodeType.Video, "blob:video", "video/mp4"),
            node("text", CanvasNodeType.Text, "成片文案", "text/plain"),
        ];

        expect(selectedCanvasResultNodes(nodes, new Set(["video", "group", "image", "empty-video"])).map((item) => item.id)).toEqual(["image", "video"]);
    });

    it("uses each node title as the safe result file name with the correct media extension", () => {
        expect(canvasResultFileName(node("image", CanvasNodeType.Image, "data:image/png;base64,AA==", "image/png"))).toBe("主视觉-A.png");
        expect(canvasResultFileName(node("video", CanvasNodeType.Video, "blob:video", "video/mp4"))).toBe("video.mp4");
        expect(canvasResultFileName(node("music", CanvasNodeType.Music, "blob:music", "audio/wav"))).toBe("music.wav");
        expect(canvasResultFileName(node("text", CanvasNodeType.Text, "文案", "text/plain"))).toBe("text.txt");
    });

    it("downloads a single text result as file content instead of treating it as a URL", async () => {
        vi.mocked(saveAs).mockClear();
        await exportCanvasResultNodes([node("text", CanvasNodeType.Text, "成片文案", "text/plain")]);

        const [data, name] = vi.mocked(saveAs).mock.calls[0];
        expect(data).toBeInstanceOf(Blob);
        expect(await (data as Blob).text()).toBe("成片文案");
        expect(name).toBe("text.txt");
    });

    it("keeps a single media result on the direct download path", async () => {
        vi.mocked(saveAs).mockClear();
        const image = node("image", CanvasNodeType.Image, "data:image/png;base64,Zmlyc3Q=", "image/png");

        await exportCanvasResultNodes([image]);

        expect(vi.mocked(saveAs)).toHaveBeenCalledWith(image.metadata?.content, "主视觉-A.png");
    });

    it("includes same-titled selected media as distinct ZIP entries", async () => {
        vi.mocked(saveAs).mockClear();
        const first = { ...node("first", CanvasNodeType.Image, "data:image/png;base64,Zmlyc3Q=", "image/png"), title: "主视觉" };
        const second = { ...node("second", CanvasNodeType.Image, "data:image/png;base64,c2Vjb25k", "image/png"), title: "主视觉" };

        await exportCanvasResultNodes([first, second]);

        const [data, name] = vi.mocked(saveAs).mock.calls[0];
        const entries = await readZip(data as Blob);
        expect([...entries.keys()]).toEqual(["主视觉.png", "主视觉-2.png"]);
        expect(await entries.get("主视觉.png")?.text()).toBe("first");
        expect(await entries.get("主视觉-2.png")?.text()).toBe("second");
        expect(name).toBe("CrocoTV-画布结果.zip");
    });
});
