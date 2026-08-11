import { describe, expect, it } from "vitest";

import type { KouboWorkspace } from "@/types/koubo-video";
import { kouboCanvasFlow } from "./canvas-flow";
import { videoWorkflowCopy } from "./workflow-copy";

const workspace: KouboWorkspace = {
    projectId: "project",
    title: "口播",
    status: "preparing_assets",
    selectedImageResultId: null,
    exportedAt: null,
    noticeUnread: false,
    latestMessage: null,
    scriptGroups: [
        { id: "g1", projectId: "project", sourceType: "ai", sourceInput: "第一批", promptVersion: "1", revision: 1, generationId: "job-1", modelPromptBinding: {} },
        { id: "g2", projectId: "project", sourceType: "pasted", sourceInput: "第三段", promptVersion: "1", revision: 1, generationId: "job-2", modelPromptBinding: {} },
    ],
    segments: [
        { id: "s2", projectId: "project", scriptGroupId: "g1", position: 1, text: "第二段", voiceDirection: "坚定", revision: 1, generationId: "job-1", modelPromptBinding: {} },
        { id: "s1", projectId: "project", scriptGroupId: "g1", position: 0, text: "第一段", voiceDirection: "自然", revision: 1, generationId: "job-1", modelPromptBinding: {} },
        { id: "s3", projectId: "project", scriptGroupId: "g2", position: 0, text: "第三段", voiceDirection: "轻松", revision: 1, generationId: "job-2", modelPromptBinding: {} },
    ],
    audioNodes: [
        { id: "a1", projectId: "project", segmentId: "s1", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: "asset", durationMs: 12_000, sourceType: "generated", sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 1, status: "ready", imageResultId: null },
        { id: "a1-1", projectId: "project", segmentId: "s1", parentAudioNodeId: "a1", segmentationRunId: "run", segmentIndex: 0, assetId: "asset-child", durationMs: 5_000, sourceType: "segment", sourceStartMs: 0, sourceEndMs: 5_000, sourceSegmentRevision: 1, status: "ready", imageResultId: null },
    ],
    imageResults: [],
    videoCandidates: [
        { id: "v1", projectId: "project", segmentId: "s1", audioNodeId: "a1", imageResultId: "image", assetId: "video", sourceSegmentRevision: 1, status: "ready", selected: true },
    ],
    compositions: [],
};

describe("kouboCanvasFlow", () => {
    it("uses course titles only when the course track explicitly supplies its copy", () => {
        const course = kouboCanvasFlow(workspace, new Set(), false, {}, videoWorkflowCopy("course-video"));
        const koubo = kouboCanvasFlow(workspace, new Set());

        expect(course.startCanvas.title).toBe("开始制作课程视频");
        expect(course.nodes.find((node) => node.kind === "script-group")?.content.title).toBe("课程文案组");
        expect(koubo.startCanvas.title).toBe("开始制作口播视频");
        expect(koubo.nodes.find((node) => node.kind === "script-group")?.content.title).toBe("口播文案组");
    });

    it("centers the start node on its immediate script group", () => {
        const singleGroupWorkspace = {
            ...workspace,
            scriptGroups: workspace.scriptGroups.slice(0, 1),
            segments: workspace.segments.filter((segment) => segment.scriptGroupId === "g1"),
        };
        const flow = kouboCanvasFlow(singleGroupWorkspace, new Set());
        const group = flow.nodes.find((node) => node.id === "koubo-script-group-g1")!.canvas;

        expect(flow.startCanvas.position.y + flow.startCanvas.height / 2).toBe(group.position.y + group.height / 2);
        expect(flow.edges.find((edge) => edge.from.id === "koubo-start")?.from.position.y).toBe(flow.startCanvas.position.y);
    });

    it("shows the independent audio generation stage instead of a generic queue label", () => {
        const toneFlow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1"
                ? { ...audio, assetId: null, status: "queued" as const, generationStage: "tone_optimizing" as const }
                : audio),
        }, new Set());
        const speechFlow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1"
                ? { ...audio, assetId: null, status: "running" as const, generationStage: "speech_generating" as const }
                : audio),
        }, new Set());

        expect(toneFlow.nodes.find((node) => node.id === "koubo-audio-a1")?.content.summary).toBe("语气优化");
        expect(speechFlow.nodes.find((node) => node.id === "koubo-audio-a1")?.content.summary).toBe("语音生成");
    });

    it("builds independent centered script subtrees and keeps the start node as their source", () => {
        const flow = kouboCanvasFlow(workspace, new Set());
        expect(flow.nodes.map((node) => node.id)).toEqual([
            "koubo-script-group-g1", "koubo-segment-s1", "koubo-segment-s2", "koubo-audio-a1", "koubo-audio-a1-1",
            "koubo-script-group-g2", "koubo-segment-s3",
        ]);
        expect(flow.edges.map((edge) => [edge.from.id, edge.to.id])).toEqual([
            ["koubo-start", "koubo-script-group-g1"],
            ["koubo-script-group-g1", "koubo-segment-s1"],
            ["koubo-script-group-g1", "koubo-segment-s2"],
            ["koubo-segment-s1", "koubo-audio-a1"],
            ["koubo-audio-a1", "koubo-audio-a1-1"],
            ["koubo-start", "koubo-script-group-g2"],
            ["koubo-script-group-g2", "koubo-segment-s3"],
        ]);
        const firstSegment = flow.nodes.find((node) => node.id === "koubo-segment-s1")!.canvas;
        const secondSegment = flow.nodes.find((node) => node.id === "koubo-segment-s2")!.canvas;
        expect(secondSegment.position.y).toBeGreaterThanOrEqual(firstSegment.position.y + firstSegment.height + 40);
        expect(flow.nodes.find((node) => node.id === "koubo-audio-a1")?.content.summary).toBe("已生成");
        expect(flow.nodes.find((node) => node.id === "koubo-audio-a1-1")?.canvas.position.x)
            .toBeGreaterThan(flow.nodes.find((node) => node.id === "koubo-audio-a1")!.canvas.position.x);
    });

    it("places a pending script task after existing groups and includes it in start centering", () => {
        const settled = kouboCanvasFlow(workspace, new Set());
        const flow = kouboCanvasFlow(workspace, new Set(), true);
        const contentBottom = Math.max(...flow.nodes.map((node) => node.canvas.position.y + node.canvas.height));

        expect(flow.pendingScriptY).toBeGreaterThanOrEqual(contentBottom + 40);
        expect(flow.startCanvas.position.y).toBeGreaterThan(settled.startCanvas.position.y);
    });

    it("lays out concurrent script tasks as separate start branches", () => {
        const flow = kouboCanvasFlow(workspace, new Set(), ["pending-1", "pending-2"]);
        const [first, second] = flow.pendingScriptCanvases;

        expect(flow.pendingScriptCanvases.map((node) => node.id)).toEqual(["pending-1", "pending-2"]);
        expect(second.position.y).toBeGreaterThanOrEqual(first.position.y + first.height + 40);
    });

    it("collapses only the chosen batch while keeping its start connection and other groups visible", () => {
        const flow = kouboCanvasFlow(workspace, new Set(["g1"]));
        expect(flow.nodes.map((node) => node.id)).toEqual([
            "koubo-script-group-g1", "koubo-script-group-g2", "koubo-segment-s3",
        ]);
        expect(flow.edges.map((edge) => [edge.from.id, edge.to.id])).toEqual([
            ["koubo-start", "koubo-script-group-g1"],
            ["koubo-start", "koubo-script-group-g2"],
            ["koubo-script-group-g2", "koubo-segment-s3"],
        ]);
    });

    it("keeps an uploaded audio-only entry as a standard node connected to the start", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            scriptGroups: [],
            segments: [],
            audioNodes: [{
                id: "uploaded",
                projectId: "project",
                segmentId: null,
                parentAudioNodeId: null,
                segmentationRunId: null,
                segmentIndex: null,
                assetId: "asset-uploaded",
                url: "/uploaded.wav",
                durationMs: 6000,
                sourceType: "uploaded",
                sourceStartMs: null,
                sourceEndMs: null,
                sourceSegmentRevision: null,
                status: "ready",
                imageResultId: null,
            }],
        }, new Set());

        expect(flow.nodes.map((node) => node.id)).toEqual(["koubo-audio-uploaded"]);
        expect(flow.edges.map((edge) => [edge.from.id, edge.to.id])).toEqual([["koubo-start", "koubo-audio-uploaded"]]);
        expect(flow.nodes[0].content.data.url).toBe("/uploaded.wav");
    });

    it("shows only the generated state on audio nodes and connects each linked first-frame image", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1" ? { ...audio, imageResultId: "image-1" } : audio),
            imageResults: [{
                id: "image-1",
                projectId: "project",
                sourceType: "upload",
                assetId: "image-asset",
                url: "/first-frame.png",
                prompt: "",
                aspectRatio: "16:9",
                status: "ready",
            }],
        }, new Set());

        const audio = flow.nodes.find((node) => node.id === "koubo-audio-a1")!;
        const image = flow.nodes.find((node) => node.id === "koubo-image-image-1")!;
        expect(audio.content.summary).toBe("已生成");
        expect(audio.content.data.durationMs).toBeUndefined();
        expect(audio.content.data.firstFrameUrl).toBe("/first-frame.png");
        expect(audio.content.data.compactStatusOnly).toBe(true);
        expect(audio.canvas.height).toBe(176);
        expect(image.content.title).toBe("角色口播图 1");
        expect(image.content.nodeType).toBe("image");
        expect(image.content.data.url).toBe("/first-frame.png");
        expect(flow.edges.some((edge) => edge.from.id === audio.id && edge.to.id === image.id)).toBe(true);
    });

    it("shows queued LTX video candidates as queued", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            imageResults: [{
                id: "image",
                projectId: "project",
                sourceType: "generated",
                assetId: "image-asset",
                url: "/role.png",
                prompt: "",
                aspectRatio: "16:9",
                status: "ready",
            }],
            videoCandidates: [{
                ...workspace.videoCandidates[0],
                assetId: null,
                status: "running",
                progress: 0,
                generationStage: "queued",
            }],
        }, new Set());

        expect(flow.nodes.find((node) => node.id === "koubo-video-v1")?.content.summary).toBe("排队中");
    });

    it("keeps an optimistic queued video in the queued visual state", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            imageResults: [{
                id: "image",
                projectId: "project",
                sourceType: "generated",
                assetId: "image-asset",
                url: "/role.png",
                prompt: "",
                aspectRatio: "16:9",
                status: "ready",
            }],
            videoCandidates: [{
                ...workspace.videoCandidates[0],
                assetId: null,
                status: "queued",
                progress: null,
                generationStage: null,
            }],
        }, new Set());

        expect(flow.nodes.find((node) => node.id === "koubo-video-v1")?.content.data.generationStage).toBe("queued");
    });

    it("shows started LTX video candidates as generating", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            imageResults: [{
                id: "image",
                projectId: "project",
                sourceType: "generated",
                assetId: "image-asset",
                url: "/role.png",
                prompt: "",
                aspectRatio: "16:9",
                status: "ready",
            }],
            videoCandidates: [{
                ...workspace.videoCandidates[0],
                assetId: null,
                status: "running",
                progress: 35,
                generationStage: "running",
            }],
        }, new Set());

        expect(flow.nodes.find((node) => node.id === "koubo-video-v1")?.content.summary).toBe("生成中 · 35%");
    });

    it("centers text, audio branches, and linked role images on one horizontal connection rhythm", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1" ? { ...audio, imageResultId: "image-1" } : audio),
            imageResults: [{
                id: "image-1",
                projectId: "project",
                sourceType: "empty",
                assetId: null,
                prompt: "",
                aspectRatio: "16:9",
                status: "draft",
            }],
        }, new Set());
        const text = flow.nodes.find((node) => node.id === "koubo-segment-s1")!.canvas;
        const audio = flow.nodes.find((node) => node.id === "koubo-audio-a1")!.canvas;
        const child = flow.nodes.find((node) => node.id === "koubo-audio-a1-1")!.canvas;
        const image = flow.nodes.find((node) => node.id === "koubo-image-image-1")!.canvas;
        const centerY = (node: typeof text) => node.position.y + node.height / 2;
        const gap = (from: typeof text, to: typeof text) => to.position.x - from.position.x - from.width;

        expect(centerY(text)).toBe(centerY(audio));
        expect(centerY(audio)).toBe(centerY(child));
        expect(centerY(audio)).toBe(centerY(image));
        expect(gap(audio, child)).toBe(gap(text, audio));
        expect(gap(child, image)).toBe(gap(text, audio));
    });

    it("uses measured node heights for centered connections and overlap-free system layout", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1" ? { ...audio, imageResultId: "image-1" } : audio),
            imageResults: [{
                id: "image-1",
                projectId: "project",
                sourceType: "generated",
                assetId: "image-asset",
                url: "/role.png",
                prompt: "",
                aspectRatio: "16:9",
                status: "ready",
            }],
        }, new Set(), false, {
            "koubo-audio-a1": 236,
            "koubo-image-image-1": 300,
        });
        const byId = new Map(flow.nodes.map((node) => [node.id, node.canvas]));
        const text = byId.get("koubo-segment-s1")!;
        const audio = byId.get("koubo-audio-a1")!;
        const child = byId.get("koubo-audio-a1-1")!;
        const image = byId.get("koubo-image-image-1")!;
        const centerY = (node: typeof text) => node.position.y + node.height / 2;

        expect(audio.height).toBe(236);
        expect(image.height).toBe(300);
        expect(centerY(text)).toBe(centerY(audio));
        expect(centerY(audio)).toBe(centerY(child));
        expect(centerY(audio)).toBe(centerY(image));
        expect(image.position.x).toBeGreaterThanOrEqual(child.position.x + child.width + 40);

        for (const [index, node] of flow.nodes.entries()) {
            for (const other of flow.nodes.slice(index + 1)) {
                const horizontalOverlap = node.canvas.position.x < other.canvas.position.x + other.canvas.width
                    && node.canvas.position.x + node.canvas.width > other.canvas.position.x;
                const verticalOverlap = node.canvas.position.y < other.canvas.position.y + other.canvas.height
                    && node.canvas.position.y + node.canvas.height > other.canvas.position.y;
                expect(horizontalOverlap && verticalOverlap, `${node.id} overlaps ${other.id}`).toBe(false);
            }
        }
    });

    it("keeps a newly linked role image centered without overlapping the previous unlinked image", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: workspace.audioNodes.map((audio) => audio.id === "a1" ? { ...audio, imageResultId: "image-2" } : audio),
            imageResults: [
                {
                    id: "image-1",
                    projectId: "project",
                    sourceType: "generated",
                    assetId: "image-asset-1",
                    url: "/role-1.png",
                    prompt: "",
                    aspectRatio: "16:9",
                    status: "ready",
                },
                {
                    id: "image-2",
                    projectId: "project",
                    sourceType: "empty",
                    assetId: null,
                    prompt: "",
                    aspectRatio: "16:9",
                    status: "draft",
                },
            ],
        }, new Set());
        const audio = flow.nodes.find((node) => node.id === "koubo-audio-a1")!.canvas;
        const previousImage = flow.nodes.find((node) => node.id === "koubo-image-image-1")!.canvas;
        const newImage = flow.nodes.find((node) => node.id === "koubo-image-image-2")!.canvas;

        expect(newImage.position.y + newImage.height / 2).toBe(audio.position.y + audio.height / 2);
        expect(previousImage.position.y).toBeGreaterThanOrEqual(newImage.position.y + newImage.height + 40);
    });

    it("places additional segment audio roots below earlier audio roots", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: [
                ...workspace.audioNodes,
                { ...workspace.audioNodes[0], id: "a2", assetId: "asset-2", sourceType: "recorded" },
            ],
        }, new Set());

        expect(flow.nodes.find((node) => node.id === "koubo-audio-a2")?.canvas.position.y)
            .toBeGreaterThan(flow.nodes.find((node) => node.id === "koubo-audio-a1")!.canvas.position.y);
    });

    it("places standalone audio entries after existing script groups", () => {
        const flow = kouboCanvasFlow({
            ...workspace,
            audioNodes: [
                ...workspace.audioNodes,
                {
                    ...workspace.audioNodes[0],
                    id: "standalone",
                    segmentId: null,
                    parentAudioNodeId: null,
                    assetId: "asset-standalone",
                    sourceType: "uploaded",
                },
            ],
        }, new Set());

        expect(flow.nodes.find((node) => node.id === "koubo-audio-standalone")?.canvas.position.y)
            .toBeGreaterThan(flow.nodes.find((node) => node.id === "koubo-script-group-g2")!.canvas.position.y);
    });
});
