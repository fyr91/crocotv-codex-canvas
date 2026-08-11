// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App, ConfigProvider, message } from "antd";
import type { MouseEvent, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KouboWorkspace } from "@/types/koubo-video";

const mocks = vi.hoisted(() => ({
    refetch: vi.fn(),
    workspaceError: false,
    createScriptGroup: vi.fn(),
    editSegment: vi.fn().mockResolvedValue(undefined),
    deleteNodes: vi.fn().mockResolvedValue(undefined),
    createImageNode: vi.fn().mockResolvedValue({ id: "image-new" }),
    linkAudioImage: vi.fn().mockResolvedValue(undefined),
    unlinkAudioImage: vi.fn().mockResolvedValue(undefined),
    registerImageAsset: vi.fn().mockResolvedValue(undefined),
    runKouboAction: vi.fn(),
    waitForGeneration: vi.fn(),
    saveCourseScriptModel: vi.fn().mockResolvedValue(undefined),
    uploadImage: vi.fn(),
    exportResults: vi.fn().mockResolvedValue(1),
    project: {
        id: "project-1",
        workflowType: "koubo-video",
        title: "口播项目",
        ownerId: "owner-1",
        topicId: null,
        createdAt: "",
        updatedAt: "",
    },
    workspace: {
        projectId: "project-1",
        title: "口播项目",
        courseScriptModelId: "ark-course-id",
        status: "preparing_assets",
        selectedImageResultId: null,
        exportedAt: null,
        noticeUnread: false,
        latestMessage: null,
        scriptGroups: [{
            id: "group-1",
            projectId: "project-1",
            sourceType: "ai",
            sourceInput: "火箭科普",
            promptVersion: "1",
            revision: 1,
            generationId: "job-1",
            modelPromptBinding: {},
        }],
        segments: [{
            id: "segment-1",
            projectId: "project-1",
            scriptGroupId: "group-1",
            position: 0,
            text: "第一段口播文案",
            voiceDirection: "自然",
            revision: 1,
            generationId: "job-1",
            modelPromptBinding: {},
        }],
        audioNodes: [{
            id: "audio-1",
            projectId: "project-1",
            segmentId: "segment-1",
            parentAudioNodeId: null,
            segmentationRunId: null,
            segmentIndex: null,
            assetId: "asset-audio-1",
            url: "/audio.wav",
            mimeType: "audio/wav",
            durationMs: 8_000,
            sourceType: "generated",
            sourceStartMs: null,
            sourceEndMs: null,
            sourceSegmentRevision: 1,
            status: "ready",
            imageResultId: null,
        }],
        imageResults: [],
        videoCandidates: [],
        compositions: [],
    } as KouboWorkspace,
}));

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
HTMLElement.prototype.scrollIntoView = vi.fn();
let narrowScreen = false;
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrowScreen,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element: Element) => getComputedStyle(element);

vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
    useQuery: ({ queryKey }: { queryKey: string[] }) => {
        if (queryKey[0] === "koubo-workspace") return { data: mocks.workspace, isLoading: false, isError: mocks.workspaceError, refetch: mocks.refetch };
        if (queryKey[0] === "speech-voices") return { data: [{ speakerId: "S_voice", alias: "测试音色", state: "Active" }], isLoading: false };
        if (queryKey[0] === "cloud-asset" && queryKey[1]) return { data: { id: queryKey[1], url: `/${queryKey[1]}.png` }, isLoading: false };
        return { data: null, isPending: false, isSuccess: false, isError: false };
    },
}));
vi.mock("./use-content-production", () => ({
    contentQueryKeys: { project: (id: string) => ["content-project", id], projects: ["content-projects"] },
    useContentWorkflowProjectQuery: () => ({ data: mocks.project, isLoading: false, isError: false }),
    useContentWorkflowProjectsQuery: () => ({ data: [mocks.project] }),
    useSaveCourseScriptModelMutation: () => ({ mutateAsync: mocks.saveCourseScriptModel, isPending: false }),
}));
vi.mock("@/stores/use-config-store", () => ({
    useConfigStore: (selector: (state: { config: Record<string, unknown> }) => unknown) => selector({ config: {
        textModel: "text-model",
        textModels: ["gemini-option", "ark-option"],
        imageModels: ["nano-model", "seedream-model"],
        videoModels: ["video-model"],
    } }),
    decodeChannelModel: (value: string) => value === "ark-option"
        ? { channelId: "ark-course-id", model: "deepseek-v4-pro" }
        : { channelId: "gemini-course-id", model: "gemini-flash" },
    providerCapabilityForModel: () => "llm",
    providerIdForModel: (value: string) => value === "ark-option" ? "ark" : "gemini",
    modelOptionLabel: (_config: unknown, value: string) => value === "ark-option" ? "DeepSeek V4 Pro" : "Gemini Flash",
    imageSizePresetsForModel: (model: string) => model === "nano-model"
        ? { "1K": { auto: "1K", "16:9": "1376x768", "9:16": "768x1376" } }
        : { "2K": { auto: "2K", "16:9": "2848x1600", "9:16": "1600x2848" } },
}));
vi.mock("@/stores/use-user-store", () => ({
    useUserStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}));
vi.mock("@/lib/koubo-video/runtime", () => ({
    expressiveSpeechModels: () => [{ value: "speech-model", label: "Expressive 2.0" }],
    ltx23VideoModels: () => [{ value: "video-model", label: "LTX 2.3" }],
    kouboImageModels: () => [
        { value: "nano-model", label: "Nano Banana 2 Lite" },
        { value: "seedream-model", label: "Seedream 5.0 Light" },
    ],
}));
vi.mock("@/services/api/koubo-video", () => ({
    createKouboScriptGroup: mocks.createScriptGroup,
    deleteKouboNodes: mocks.deleteNodes,
    createKouboImageNode: mocks.createImageNode,
    editKouboSegment: mocks.editSegment,
    getKouboWorkspace: vi.fn(),
    markKouboNoticeSeen: vi.fn(),
    registerKouboAudioNode: vi.fn(),
    linkKouboAudioImage: mocks.linkAudioImage,
    unlinkKouboAudioImage: mocks.unlinkAudioImage,
    registerKouboImageAsset: mocks.registerImageAsset,
    replaceKouboAudioSegments: vi.fn(),
    runKouboAction: mocks.runKouboAction,
    selectKouboImage: vi.fn(),
    selectKouboVideoCandidate: vi.fn(),
    subscribeKouboWorkspace: () => () => undefined,
}));
vi.mock("@/services/api/generation-client", () => ({ modelId: (value: string) => value === "ark-option" ? "ark-course-id" : value, waitForGeneration: mocks.waitForGeneration }));
vi.mock("@/services/api/cloud-assets", () => ({ getCloudAsset: vi.fn() }));
vi.mock("@/services/api/speech-voices", () => ({ getSpeechVoices: vi.fn() }));
vi.mock("@/services/api/content-production", () => ({ initializeKouboWorkflowProject: vi.fn() }));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: vi.fn() }));
vi.mock("@/services/image-storage", () => ({ uploadImage: mocks.uploadImage }));
vi.mock("@/lib/canvas/canvas-result-export", () => ({ exportCanvasResultNodes: mocks.exportResults }));
vi.mock("@/components/canvas/canvas-connections", () => ({
    ConnectionPath: ({ connection, active, onSelect }: {
        connection: { id: string };
        active: boolean;
        onSelect: () => void;
    }) => <button aria-label={`连接线 ${connection.id}`} data-active={active} onClick={onSelect} />,
    ActiveConnectionPath: () => null,
}));
vi.mock("@/components/canvas/asset-picker-modal", () => ({
    AssetPickerModal: ({ open, title, onInsert }: { open: boolean; title?: string; onInsert: (payload: { kind: "image"; assetId: string; storageKey: string; dataUrl: string; title: string }) => void }) => open ? (
        <div role="dialog" aria-label={title || "选择素材"}>
            <button onClick={() => onInsert({ kind: "image", assetId: "picked", storageKey: "picked-storage", dataUrl: "/picked.png", title: "选中图片" })}>选择测试图片</button>
        </div>
    ) : null,
}));
vi.mock("@/components/canvas/crocotv-canvas", () => ({ CrocoCanvas: ({ children, containerRef }: { children: ReactNode; containerRef: { current: HTMLDivElement | null } }) => <div data-testid="koubo-canvas" ref={(element) => {
    containerRef.current = element;
    if (element) element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON: () => ({}) });
}}>{children}</div> }));
vi.mock("@/components/layout/page-shell", () => ({ WorkspacePage: ({ topBar, children }: { topBar?: ReactNode; children: ReactNode }) => <main data-testid="workspace-page">{topBar}{children}</main> }));
vi.mock("./components/content-tree-node", () => ({
    ContentTreeNode: ({ node, selected, onSelect, onContextMenu, quickActionTitle, onQuickAction, quickActionDisabled, downloadTitle, downloading, downloadDisabled, downloadAfterRegenerate, onDownload, regenerateTitle, regenerating, onRegenerate, optimizeTitle, optimizeOpen, onToggleOptimize, onOptimize, onConnectStart, connectTitle }: {
        node: { id: string; title: string; summary: string; nodeType: string; status: string; data: Record<string, unknown> };
        selected: boolean;
        onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
        onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
        quickActionTitle?: string;
        onQuickAction?: () => void;
        quickActionDisabled?: boolean;
        downloadTitle?: string;
        downloading?: boolean;
        downloadDisabled?: boolean;
        downloadAfterRegenerate?: boolean;
        onDownload?: () => void;
        regenerateTitle?: string;
        regenerating?: boolean;
        onRegenerate?: () => void;
        optimizeTitle?: string;
        optimizeOpen?: boolean;
        onToggleOptimize?: () => void;
        onOptimize?: (direction: string) => Promise<void>;
        onConnectStart?: (event: MouseEvent<HTMLButtonElement>) => void;
        connectTitle?: string;
    }) => <div data-node-id={node.id} data-node-status={node.status} data-node-summary={node.summary}>
        <button data-selected={selected} onClick={onSelect} onContextMenu={onContextMenu}>{node.title}{node.nodeType === "tts" && node.data.url ? <audio controls src={String(node.data.url)} /> : null}</button>
        {onConnectStart ? <button aria-label={connectTitle} onMouseDown={onConnectStart}>连接</button> : null}
        {quickActionTitle && onQuickAction ? <button disabled={quickActionDisabled} onClick={onQuickAction}>{quickActionTitle}</button> : null}
        {downloadTitle && onDownload ? <button disabled={downloadDisabled} data-download-after-regenerate={downloadAfterRegenerate} data-downloading={downloading} onClick={onDownload}>{downloadTitle}</button> : null}
        {regenerateTitle && onRegenerate ? <button data-regenerating={regenerating} onClick={onRegenerate}>{regenerateTitle}</button> : null}
        {optimizeTitle && onToggleOptimize ? <button onClick={onToggleOptimize}>{optimizeTitle}</button> : null}
        {optimizeOpen && onOptimize ? <button onClick={() => void onOptimize("说得更适合小朋友")}>{optimizeTitle?.includes("整组") ? "提交整组优化" : "提交单段优化"}</button> : null}
    </div>,
}));
vi.mock("./components/content-model-prompt-tuning", () => ({ ContentModelPromptTuning: () => <div>Prompt tuning</div> }));
vi.mock("./components/content-node-panel-tabs", () => ({
    ContentNodePanelTabs: ({ content }: { content: ReactNode }) => <aside>{content}</aside>,
}));

import KouboVideoPage from "./koubo-video";

afterEach(() => {
    vi.restoreAllMocks();
    narrowScreen = false;
    mocks.workspaceError = false;
    mocks.runKouboAction.mockReset();
    mocks.waitForGeneration.mockReset();
    mocks.saveCourseScriptModel.mockReset();
    mocks.saveCourseScriptModel.mockResolvedValue(undefined);
    mocks.createScriptGroup.mockReset();
    mocks.createScriptGroup.mockResolvedValue([]);
    mocks.editSegment.mockReset();
    mocks.editSegment.mockResolvedValue(undefined);
    mocks.deleteNodes.mockReset();
    mocks.deleteNodes.mockResolvedValue(undefined);
    mocks.createImageNode.mockReset();
    mocks.createImageNode.mockResolvedValue({ id: "image-new" });
    mocks.linkAudioImage.mockReset();
    mocks.linkAudioImage.mockResolvedValue(undefined);
    mocks.unlinkAudioImage.mockReset();
    mocks.unlinkAudioImage.mockResolvedValue(undefined);
    mocks.registerImageAsset.mockReset();
    mocks.uploadImage.mockReset();
    mocks.uploadImage.mockResolvedValue({ storageKey: "uploaded-image", url: "/uploaded.png", width: 100, height: 100, bytes: 100, mimeType: "image/png" });
    mocks.exportResults.mockReset();
    mocks.exportResults.mockResolvedValue(1);
    mocks.workspace.audioNodes[0].assetId = "asset-audio-1";
    mocks.workspace.audioNodes[0].url = "/audio.wav";
    mocks.workspace.audioNodes[0].durationMs = 8_000;
    mocks.workspace.audioNodes[0].status = "ready";
    mocks.workspace.audioNodes[0].errorMessage = null;
    mocks.workspace.audioNodes[0].imageResultId = null;
    mocks.workspace.imageResults = [];
    mocks.workspace.videoCandidates = [];
    mocks.project.workflowType = "koubo-video";
    mocks.project.title = "口播项目";
    mocks.workspace.title = "口播项目";
    mocks.workspace.segments[0].text = "第一段口播文案";
    mocks.workspace.segments[0].voiceDirection = "自然";
    mocks.workspace.segments[0].revision = 1;
    mocks.workspace.segments.splice(1);
    mocks.workspace.audioNodes.splice(1);
    cleanup();
});

describe("KouboVideoPage", () => {
    it("keeps course projects on their independent route and switcher scope", () => {
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.getByLabelText("切换课程视频项目")).toBeTruthy();
        expect(screen.queryByLabelText("切换口播视频项目")).toBeNull();
    });

    it("renders the independent course script form and submits its structured prompt", async () => {
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        mocks.runKouboAction.mockResolvedValue({
            job: { id: "job-course-script", status: "succeeded" },
            segments: [{ text: "第一段课程文案", voiceDirection: "清晰" }],
        });
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.getByRole("heading", { name: "开始制作课程视频" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "课程文案组" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "生成课程文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        expect(within(scriptDialog).getByText("生成课程文案")).toBeTruthy();
        fireEvent.change(within(scriptDialog).getByRole("textbox", { name: "课程主题" }), { target: { value: " 光合作用 " } });
        fireEvent.change(within(scriptDialog).getByRole("textbox", { name: "目标受众" }), { target: { value: " 初中生 " } });
        fireEvent.change(within(scriptDialog).getByRole("textbox", { name: "课程额外提示词" }), { target: { value: " 多举例 " } });
        expect(within(scriptDialog).getByRole("switch", { name: "拆分为视频文案片段" }).getAttribute("aria-checked")).toBe("true");
        fireEvent.click(within(scriptDialog).getByRole("button", { name: "生成" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-script",
            modelId: "ark-course-id",
            prompt: "课程主题：光合作用\n目标受众：初中生\n额外提示词：多举例",
            outputMode: "segments",
        })));
    });

    it("validates the required course topic and audience independently", async () => {
        const warning = vi.spyOn(message, "warning").mockImplementation(() => undefined as never);
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成课程文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        expect(within(scriptDialog).getByText("生成课程文案")).toBeTruthy();
        fireEvent.click(within(scriptDialog).getByRole("button", { name: "生成" }));
        expect(warning).toHaveBeenLastCalledWith("请填写课程主题");

        fireEvent.change(within(scriptDialog).getByRole("textbox", { name: "课程主题" }), { target: { value: "光合作用" } });
        fireEvent.click(within(scriptDialog).getByRole("button", { name: "生成" }));
        expect(warning).toHaveBeenLastCalledWith("请填写目标受众");
        expect(mocks.runKouboAction).not.toHaveBeenCalled();
    });

    it("keeps paste import interactive while course script generation is still running", async () => {
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成课程文案" }));
        let dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("课程主题"), { target: { value: "光合作用" } });
        fireEvent.change(within(dialog).getByLabelText("目标受众"), { target: { value: "初中生" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "生成" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalled());

        fireEvent.click(screen.getByRole("button", { name: "粘贴自己的文案" }));
        dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("导入原文"), { target: { value: "自己的课程文案" } });
        fireEvent.change(within(dialog).getByLabelText("整篇语气指导"), { target: { value: "清晰自然" } });
        const confirm = within(dialog).getAllByRole("button").at(-1)!;
        expect(confirm.className).not.toContain("ant-btn-loading");
        fireEvent.click(confirm);

        await vi.waitFor(() => expect(mocks.createScriptGroup).toHaveBeenCalledWith(expect.objectContaining({
            projectId: "project-1",
            originalText: "自己的课程文案",
        })));
    });

    it("allows another course script submission while earlier content is still generating", async () => {
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成课程文案" }));
        let dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("课程主题"), { target: { value: "光合作用" } });
        fireEvent.change(within(dialog).getByLabelText("目标受众"), { target: { value: "初中生" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "生成" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(1));
        expect(screen.getAllByRole("button", { name: "课程文案生成" })).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "生成课程文案" }));
        dialog = await screen.findByRole("dialog");
        const generate = within(dialog).getByRole("button", { name: "生成" });
        expect(generate.className).not.toContain("ant-btn-loading");
        expect((generate as HTMLButtonElement).disabled).toBe(false);
        fireEvent.change(within(dialog).getByLabelText("课程主题"), { target: { value: "牛顿定律" } });
        fireEvent.change(within(dialog).getByLabelText("目标受众"), { target: { value: "高中生" } });
        fireEvent.click(generate);

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(2));
        expect(screen.getAllByRole("button", { name: "课程文案生成" })).toHaveLength(2);
    });

    it("keeps the talking-head script modal on its existing single-generation behavior", async () => {
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        let dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("口播文案生成要求"), { target: { value: "介绍光合作用" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "生成" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("button", { name: "生成" }).className).toContain("ant-btn-loading");
    });

    it("keeps the talking-head script form and labels unchanged", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.getByRole("heading", { name: "开始制作口播视频" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        expect(within(scriptDialog).getByText("生成口播文案")).toBeTruthy();
        expect(within(scriptDialog).getByRole("textbox", { name: "口播文案生成要求" })).toBeTruthy();
        expect(within(scriptDialog).getByRole("switch", { name: "拆分为口播片段" })).toBeTruthy();
        expect(within(scriptDialog).queryByRole("textbox", { name: "课程主题" })).toBeNull();
    });

    it("hides a course script group's descendants before submitting whole-group optimization", async () => {
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        let resolveAction: (value: unknown) => void = () => undefined;
        mocks.runKouboAction.mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "按要求优化整组课程文案" }));
        fireEvent.click(screen.getByRole("button", { name: "提交整组优化" }));

        expect(screen.queryByRole("button", { name: "文案 1" })).toBeNull();
        expect(screen.queryByRole("button", { name: "音频 1" })).toBeNull();
        expect(screen.getByRole("button", { name: "课程文案组" })).toBeTruthy();
        expect(mocks.runKouboAction).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "replace-script-group-input",
            scriptGroupId: "group-1",
            sourceType: "ai",
            prompt: "火箭科普\n\n整组优化要求：\n说得更适合小朋友",
            outputMode: "segments",
        })));

        resolveAction({ job: { id: "job-optimized", status: "succeeded" }, segments: [{ text: "新文案", voiceDirection: "清晰" }] });
        await vi.waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    });

    it("restores course descendants and keeps the optimization panel open when whole-group optimization fails", async () => {
        const errorMessage = vi.spyOn(message, "error").mockImplementation(() => undefined as never);
        mocks.project.workflowType = "course-video";
        mocks.project.title = "课程项目";
        mocks.workspace.title = "课程项目";
        let rejectAction: (error: Error) => void = () => undefined;
        mocks.runKouboAction.mockReturnValue(new Promise((_, reject) => { rejectAction = reject; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/course-video/project-1"]}>
                    <Routes>
                        <Route path="/content/course-video/:projectId" element={<KouboVideoPage workflowType="course-video" />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "按要求优化整组课程文案" }));
        fireEvent.click(screen.getByRole("button", { name: "提交整组优化" }));
        expect(screen.queryByRole("button", { name: "文案 1" })).toBeNull();
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalled());
        rejectAction(new Error("课程文案优化失败"));

        expect(await screen.findByRole("button", { name: "文案 1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "提交整组优化" })).toBeTruthy();
        expect(errorMessage).toHaveBeenCalledWith("课程文案优化失败");
    });

    it("does not add whole-group optimization to the talking-head track", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.queryByRole("button", { name: "按要求优化整组口播文案" })).toBeNull();
        expect(screen.getByRole("button", { name: "按要求优化本段文案" })).toBeTruthy();
    });

    it("renders the unavailable project state as a full-screen system page", () => {
        mocks.workspaceError = true;
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.getByRole("heading", { name: "项目不可用" })).toBeTruthy();
        expect(screen.queryByTestId("workspace-page")).toBeNull();
    });

    it("uses the fixed side panel without an extra floating shortcut", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.getByLabelText("口播节点设置面板")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "打开口播节点面板" })).toBeNull();
    });

    it("keeps the audio node compact and opens segmentation in the fixed panel without confirmation semantics", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const audioNode = screen.getByRole("button", { name: "音频 1" });
        fireEvent.click(audioNode);

        const panel = screen.getByLabelText("口播节点设置面板");
        expect(within(panel).getByText("音频分段")).toBeTruthy();
        expect(screen.queryByText(/确认采用|待确认|已确认/)).toBeNull();
        expect(screen.queryByRole("button", { name: "打开口播节点面板" })).toBeNull();
    });

    it("downloads a ready audio node from its existing frontend URL", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const download = screen.getByRole("button", { name: "下载音频" });
        expect(download).toHaveProperty("disabled", false);
        expect(download.getAttribute("data-download-after-regenerate")).toBe("true");
        fireEvent.click(download);

        await vi.waitFor(() => expect(mocks.exportResults).toHaveBeenCalledOnce());
        const [[nodes]] = mocks.exportResults.mock.calls;
        expect(nodes).toHaveLength(1);
        expect(nodes[0]).toMatchObject({
            type: "audio",
            metadata: { content: "/audio.wav", mimeType: "audio/wav" },
        });
    });

    it("offers existing or new role images from the audio panel footer", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/first-frame.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "音频 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        fireEvent.click(within(panel).getByRole("button", { name: "连接角色图片" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "角色口播图 1" }));

        await vi.waitFor(() => expect(mocks.linkAudioImage).toHaveBeenCalledWith("audio-1", "image-1"));
    });

    it("creates and immediately links a role image node when an audio connection drops on empty canvas", async () => {
        mocks.createImageNode.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.mouseDown(screen.getByRole("button", { name: "从音频 1连接角色口播图" }), { clientX: 100, clientY: 100 });
        fireEvent.mouseUp(screen.getByTestId("koubo-canvas"), { clientX: 600, clientY: 300 });

        expect(screen.getByRole("button", { name: "角色口播图 1" })).toBeTruthy();
        await vi.waitFor(() => expect(mocks.createImageNode).toHaveBeenCalledWith("project-1", "audio-1"));
    });

    it("links an existing role image when an audio connection drops on that node", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/first-frame.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.mouseDown(screen.getByRole("button", { name: "从音频 1连接角色口播图" }), { clientX: 100, clientY: 100 });
        fireEvent.mouseUp(screen.getByRole("button", { name: "角色口播图 1" }), { clientX: 700, clientY: 300 });
        await vi.waitFor(() => expect(mocks.linkAudioImage).toHaveBeenCalledWith("audio-1", "image-1"));
    });

    it("submits role-image generation through the default Nano Banana 2 Lite settings", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "empty",
            assetId: null,
            prompt: "",
            aspectRatio: "16:9",
            status: "draft",
        }];
        mocks.runKouboAction.mockResolvedValue({});
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        expect(within(panel).getByText("Nano Banana 2 Lite")).toBeTruthy();
        const editor = within(panel).getByRole("textbox", { name: "角色口播图提示词" });
        editor.textContent = "自然光下的人物半身正面照";
        fireEvent.input(editor);
        fireEvent.click(within(panel).getByRole("button", { name: "生成角色口播图" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-image",
            imageResultId: "image-1",
            modelId: "nano-model",
            aspectRatio: "16:9",
            size: "1376x768",
        })));
    });

    it("submits one independent video task per linked audio and shows queued clip nodes immediately", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes.push(
            { ...mocks.workspace.audioNodes[0], id: "audio-2", imageResultId: "image-1" },
            { ...mocks.workspace.audioNodes[0], id: "audio-3", imageResultId: "image-1" },
        );
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成口播视频（3 段）" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(3));
        expect(mocks.runKouboAction.mock.calls.map(([request]) => request.audioNodeId)).toEqual(["audio-1", "audio-2", "audio-3"]);
        expect(screen.getByRole("button", { name: "口播视频 1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "口播视频 3" })).toBeTruthy();
    });

    it("submits the currently selected portrait ratio for Koubo video generation", async () => {
        vi.spyOn(message, "success").mockImplementation(() => undefined as never);
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.runKouboAction.mockResolvedValue({});
        mocks.refetch.mockResolvedValue({});
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        const ratioField = within(panel).getByText("画面比例").parentElement!;
        fireEvent.mouseDown(within(ratioField).getByRole("combobox"));
        fireEvent.click((await screen.findByText("9:16", { selector: ".ant-select-item-option-content" })).parentElement!);
        await vi.waitFor(() => expect(ratioField.textContent).toContain("9:16"));
        fireEvent.click(within(panel).getByRole("button", { name: "生成口播视频（1 段）" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-video",
            aspectRatio: "9:16",
        })));
    });

    it("reports only whether the video generation task was submitted", async () => {
        const successMessage = vi.spyOn(message, "success").mockImplementation(() => undefined as never);
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.runKouboAction.mockResolvedValue({});
        mocks.refetch.mockResolvedValue({});
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成口播视频（1 段）" }));

        await vi.waitFor(() => expect(successMessage).toHaveBeenCalledWith("视频生成任务已提交"));
    });

    it("does not show a redundant independent-node notice for a selected video clip", () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.workspace.videoCandidates = [{
            id: "video-1",
            projectId: "project-1",
            segmentId: "segment-1",
            audioNodeId: "audio-1",
            imageResultId: "image-1",
            assetId: "video-asset",
            sourceSegmentRevision: 1,
            status: "ready",
            selected: false,
            generationId: "job-video-1",
            clientRequestId: "request-video-1",
            errorMessage: null,
            progress: 100,
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "口播视频 1" }));

        expect(within(screen.getByLabelText("口播节点设置面板")).queryByText("口播视频已作为独立节点生成。")).toBeNull();
    });

    it("downloads and regenerates a ready video from its node footer", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.workspace.videoCandidates = [{
            id: "video-1",
            projectId: "project-1",
            segmentId: "segment-1",
            audioNodeId: "audio-1",
            imageResultId: "image-1",
            assetId: "video-asset",
            url: "/talking-head.mp4",
            mimeType: "video/mp4",
            sourceSegmentRevision: 1,
            status: "ready",
            selected: false,
            generationId: "job-video-1",
            clientRequestId: "request-video-1",
            errorMessage: null,
            progress: 100,
        }];
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "下载口播视频" }));
        await vi.waitFor(() => expect(mocks.exportResults).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "video",
                title: "口播视频 1",
                metadata: expect.objectContaining({ content: "/talking-head.mp4", mimeType: "video/mp4" }),
            }),
        ]));

        fireEvent.click(screen.getByRole("button", { name: "重新生成口播视频" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-video",
            projectId: "project-1",
            videoCandidateId: "video-1",
            audioNodeId: "audio-1",
            imageResultId: "image-1",
            modelId: "video-model",
        })));
        expect(document.querySelectorAll('[data-node-id="koubo-video-video-1"]')).toHaveLength(1);
        expect(document.querySelector('[data-node-id="koubo-video-video-1"]')?.getAttribute("data-node-status")).toBe("running");
    });

    it("keeps separate spacing between role-image regeneration and video generation", () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        const actions = within(screen.getByLabelText("口播节点设置面板")).getByRole("group", { name: "角色口播图生成操作" });
        expect(actions.classList.contains("gap-2")).toBe(true);
        expect(within(actions).getByRole("button", { name: "生成角色口播图" })).toBeTruthy();
        expect(within(actions).getByRole("button", { name: "生成口播视频（1 段）" })).toBeTruthy();
    });

    it("spins the role image regenerate action only while that image is being generated", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "generated",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "人物正对镜头",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const regenerate = screen.getByRole("button", { name: "生成角色口播图" });
        expect(regenerate.getAttribute("data-regenerating")).toBe("false");
        fireEvent.click(regenerate);

        await vi.waitFor(() => expect(regenerate.getAttribute("data-regenerating")).toBe("true"));
    });

    it("uses one preview-and-replace pattern for the role image and both references", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "人物正对镜头",
            aspectRatio: "16:9",
            status: "ready",
            personReferenceAssetId: "person-asset",
            backgroundReferenceAssetId: "background-asset",
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        const role = within(panel).getByLabelText("角色口播图素材");
        const generation = within(panel).getByLabelText("角色口播图生成设置");

        expect(within(role).getByAltText("角色口播图").getAttribute("src")).toBe("/role.png");
        expect(within(generation).getByAltText("人物参考").getAttribute("src")).toBe("/person-asset.png");
        expect(within(generation).getByAltText("背景参考").getAttribute("src")).toBe("/background-asset.png");
        expect(within(panel).queryByText("拖拽图片到这里，或点击上传")).toBeNull();
        expect(within(role).getByLabelText("拖拽替换角色口播图")).toBeTruthy();
        expect(within(generation).getByLabelText("拖拽替换人物参考")).toBeTruthy();
        expect(within(generation).getByLabelText("拖拽替换背景参考")).toBeTruthy();
        expect(within(panel).getByText("上传首帧或生成图片").closest('[role="separator"]')).toBeTruthy();
        expect(panel.firstElementChild?.className).toContain("space-y-5");
        for (const [section, title] of [[role, "角色口播图"], [generation, "人物参考"], [generation, "背景参考"]] as const) {
            const upload = within(section).getByRole("button", { name: `重新上传${title}` });
            const library = within(section).getByRole("button", { name: `从素材库替换${title}` });
            expect(upload.className).toContain("size-8");
            expect(upload.className).toContain("rounded-lg");
            expect(library.className).toContain("size-8");
            expect(library.className).toContain("rounded-lg");
        }

        fireEvent.click(within(role).getByRole("button", { name: "查看角色口播图大图" }));
        expect(await screen.findByAltText("角色口播图大图预览")).toBeTruthy();
        fireEvent.click(within(generation).getByRole("button", { name: "从素材库替换人物参考" }));
        expect(await screen.findByRole("dialog", { name: "选择人物参考" })).toBeTruthy();
    });

    it("defaults to Nano Banana 2 Lite and composes available references with @", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "generated",
            assetId: null,
            prompt: "",
            aspectRatio: "16:9",
            status: "draft",
            personReferenceAssetId: "person-asset",
            backgroundReferenceAssetId: "background-asset",
        }];
        mocks.runKouboAction.mockResolvedValue(undefined);
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        const modelSelect = within(panel).getByRole("combobox", { name: "角色口播图模型" });
        expect(within(panel).getByText("Nano Banana 2 Lite")).toBeTruthy();
        fireEvent.mouseDown(modelSelect);
        expect(await screen.findByText("Seedream 5.0 Light")).toBeTruthy();

        const editor = within(panel).getByRole("textbox", { name: "角色口播图提示词" });
        editor.textContent = "@";
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        fireEvent.input(editor);
        const mentionMenu = await vi.waitFor(() => {
            const menu = document.querySelector("[data-canvas-resource-mention-menu='true']");
            expect(menu).toBeTruthy();
            return menu as HTMLElement;
        });
        expect(within(mentionMenu).getByRole("button", { name: /人物参考/ })).toBeTruthy();
        expect(within(mentionMenu).getByRole("button", { name: /背景参考/ })).toBeTruthy();
        expect(mentionMenu.querySelector("img[src='/person-asset.png']")).toBeTruthy();
        expect(mentionMenu.querySelector("img[src='/background-asset.png']")).toBeTruthy();

        editor.textContent = "人物参考站在背景参考前，正对镜头";
        fireEvent.input(editor);
        fireEvent.click(within(panel).getByRole("button", { name: "生成角色口播图" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalled());
        expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-image",
            modelId: "nano-model",
            prompt: "人物参考站在背景参考前，正对镜头",
            personReferenceAssetId: "person-asset",
            backgroundReferenceAssetId: "background-asset",
            size: "1376x768",
        }));
    });

    it("shows the persisted role image failure reason in the panel", () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "generated",
            assetId: null,
            prompt: "人物正对镜头",
            aspectRatio: "16:9",
            status: "failed",
            errorMessage: "图片生成超时",
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "角色口播图 1" }));
        expect(within(screen.getByLabelText("口播节点设置面板")).getByText("图片生成超时")).toBeTruthy();
    });

    it("does not show unfinished downstream actions in the script panel", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        expect(screen.queryByText("音频分段后的下游生成流程将在后续版本定义。")).toBeNull();
        expect(screen.queryByRole("button", { name: "生成视频与合并" })).toBeNull();
    });

    it("keeps the start node and limits the script group panel to TTS generation", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const desktopPanel = screen.getByLabelText("口播节点设置面板");
        const desktopActionStack = within(desktopPanel).getByRole("button", { name: "生成全部 TTS" }).parentElement;
        expect(desktopActionStack?.className).toContain("flex flex-col gap-2");
        expect(within(desktopPanel).queryByRole("button", { name: "重新导入文案" })).toBeNull();
        expect(within(desktopPanel).queryByRole("button", { name: "上传整组对应音频" })).toBeNull();
        expect(within(desktopPanel).queryByRole("button", { name: "合并已确认视频" })).toBeNull();
        expect(screen.getByRole("button", { name: "生成口播文案" })).not.toBeNull();
    });

    it("shows and copies the original AI generation requirement from its script group panel", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <App>
                    <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                        <Routes>
                            <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                        </Routes>
                    </MemoryRouter>
                </App>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "口播文案组" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        expect((within(panel).getByLabelText("原始生成要求") as HTMLTextAreaElement).value).toBe("火箭科普");
        fireEvent.click(within(panel).getByRole("button", { name: "复制生成要求" }));

        expect(await screen.findByText("生成要求已复制")).toBeTruthy();
    });

    it("shows a new queued script node when persisted script groups already exist", async () => {
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        fireEvent.change(within(scriptDialog).getByPlaceholderText("描述口播主题、受众和表达目标"), { target: { value: "生成火箭科普" } });
        const buttons = within(scriptDialog).getAllByRole("button");
        fireEvent.click(buttons[buttons.length - 1]);

        expect(await screen.findByRole("button", { name: "口播文案生成" })).not.toBeNull();
        expect(screen.getByRole("button", { name: "口播文案组" })).not.toBeNull();
    });

    it("generates segmented scripts by default and sends the selected output mode", async () => {
        mocks.runKouboAction.mockResolvedValue({
            job: { id: "job-script", status: "succeeded" },
            segments: [{ text: "第一段", voiceDirection: "自然" }],
        });
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        const segmentToggle = within(scriptDialog).getByRole("switch", { name: "拆分为口播片段" });
        expect(segmentToggle.getAttribute("aria-checked")).toBe("true");
        fireEvent.change(within(scriptDialog).getByLabelText("口播文案生成要求"), { target: { value: "生成火箭科普" } });
        fireEvent.click(within(scriptDialog).getByRole("button", { name: "生成" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-script",
            outputMode: "segments",
        })));
    });

    it("generates one whole script and one overall voice direction when segmentation is disabled", async () => {
        mocks.runKouboAction.mockResolvedValue({
            job: { id: "job-script", status: "succeeded" },
            segments: [{ text: "完整口播文案", voiceDirection: "整篇亲切自然" }],
        });
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成口播文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        fireEvent.click(within(scriptDialog).getByRole("switch", { name: "拆分为口播片段" }));
        fireEvent.change(within(scriptDialog).getByLabelText("口播文案生成要求"), { target: { value: "生成完整火箭科普" } });
        fireEvent.click(within(scriptDialog).getByRole("button", { name: "生成" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-script",
            outputMode: "full",
        })));
    });

    it("imports pasted text and voice direction directly without an LLM action", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "粘贴自己的文案" }));
        const scriptDialog = await screen.findByRole("dialog");
        fireEvent.change(within(scriptDialog).getByLabelText("导入原文"), { target: { value: "完整原文" } });
        fireEvent.change(within(scriptDialog).getByLabelText("整篇语气指导"), { target: { value: "亲切、自然" } });
        const buttons = within(scriptDialog).getAllByRole("button");
        fireEvent.click(buttons[buttons.length - 1]);

        await vi.waitFor(() => expect(mocks.createScriptGroup).toHaveBeenCalledWith({
            projectId: "project-1",
            sourceType: "pasted",
            sourceInput: JSON.stringify({ originalText: "完整原文", voiceDirection: "亲切、自然" }),
            originalText: "完整原文",
            segments: [{ text: "完整原文", voiceDirection: "亲切、自然" }],
        }));
        expect(mocks.runKouboAction).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "文案导入处理" })).toBeNull();
    });

    it("uses separate upload and recording popups without warnings or footer actions", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "上传已有音频" }));
        let dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("拖拽音频到这里，或点击选择文件")).not.toBeNull();
        expect(within(dialog).queryByText("请先上传或录制音频")).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "录制音频" })).toBeNull();
        expect(within(dialog).queryByText("使用这个音频")).toBeNull();
        expect(within(dialog).queryByText("Cancel")).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

        fireEvent.click(screen.getByRole("button", { name: "录制自己的音频" }));
        dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("button", { name: "开始录制" })).not.toBeNull();
        expect(within(dialog).queryByText("拖拽音频到这里，或点击选择文件")).toBeNull();
        expect(within(dialog).queryByText("请先上传或录制音频")).toBeNull();
        expect(within(dialog).queryByText("使用这个音频")).toBeNull();
        expect(within(dialog).queryByText("Cancel")).toBeNull();
    });

    it("shows a live waveform while recording", async () => {
        const animationFrames: FrameRequestCallback[] = [];
        let analyserCreated = false;
        let resumeCalls = 0;
        class TestMediaRecorder {
            mimeType = "audio/webm";
            ondataavailable: ((event: BlobEvent) => void) | null = null;
            onstop: (() => void) | null = null;
            start() {}
            stop() { this.onstop?.(); }
        }
        class TestAudioContext {
            state = "suspended";
            createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
            createAnalyser() {
                analyserCreated = true;
                return {
                    fftSize: 8,
                    smoothingTimeConstant: 0,
                    connect() {},
                    disconnect() {},
                    getByteTimeDomainData(data: Uint8Array) {
                        data.forEach((_, index) => { data[index] = index % 2 ? 130 : 126; });
                    },
                };
            }
            resume() {
                resumeCalls += 1;
                this.state = "running";
                return Promise.resolve();
            }
            close() { return Promise.resolve(); }
        }
        const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
        vi.stubGlobal("MediaRecorder", TestMediaRecorder);
        vi.stubGlobal("AudioContext", TestAudioContext);
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());

        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "录制自己的音频" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "开始录制" }));
        const waveform = await screen.findByRole("img", { name: "实时录音波形" });
        const lastBar = within(waveform).getAllByTestId("recording-waveform-bar").at(-1)!;
        const initialHeight = lastBar.style.height;
        await vi.waitFor(() => expect(analyserCreated).toBe(true));
        await vi.waitFor(() => expect(resumeCalls).toBe(1));
        act(() => animationFrames.forEach((callback) => callback(0)));
        await vi.waitFor(() => expect(within(waveform).getAllByTestId("recording-waveform-bar").at(-1)!.style.height).not.toBe(initialHeight));
    });

    it("shows the target segment text only when recording for that segment", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "录制本段音频" }));
        let dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText("录制对应文案").textContent).toContain("第一段口播文案");

        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        fireEvent.click(screen.getByRole("button", { name: "录制自己的音频" }));
        dialog = await screen.findByRole("dialog");
        expect(within(dialog).queryByLabelText("录制对应文案")).toBeNull();
    });

    it("shows a queued audio node before the TTS request finishes", async () => {
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成本段音频" }));

        await vi.waitFor(() => expect(screen.getAllByRole("button", { name: "音频 1" })).toHaveLength(2));
        expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.not.objectContaining({
            audioNodeId: expect.anything(),
        }));
    });

    it("immediately overwrites a failed audio node instead of adding a retry node", async () => {
        mocks.workspace.audioNodes[0].assetId = null;
        mocks.workspace.audioNodes[0].url = undefined;
        mocks.workspace.audioNodes[0].durationMs = null;
        mocks.workspace.audioNodes[0].status = "failed";
        mocks.workspace.audioNodes[0].errorMessage = "生成失败";
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const failedNode = document.querySelector<HTMLElement>('[data-node-id="koubo-audio-audio-1"]')!;
        fireEvent.click(within(failedNode).getByRole("button", { name: "生成本段音频" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-tts",
            segmentId: "segment-1",
            audioNodeId: "audio-1",
        })));
        expect(screen.getAllByRole("button", { name: "音频 1" })).toHaveLength(1);
        expect(document.querySelector('[data-node-id="koubo-audio-audio-1"]')).toBe(failedNode);
        expect(failedNode.dataset.nodeStatus).toBe("running");
    });

    it("submits the selected speech speed and volume with TTS generation", async () => {
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        fireEvent.change(within(panel).getByRole("spinbutton", { name: "口播语速" }), { target: { value: "1.25" } });
        fireEvent.change(within(panel).getByRole("spinbutton", { name: "口播音量" }), { target: { value: "1.5" } });
        fireEvent.click(within(panel).getByRole("button", { name: "生成本段音频" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-tts",
            speed: 1.25,
            volume: 1.5,
        })));
    });

    it("defaults tone optimization on and resumes TTS after its Gemini job completes", async () => {
        mocks.runKouboAction
            .mockResolvedValueOnce({ toneOptimizationJob: { id: "tone-job-1", status: "running" } })
            .mockResolvedValueOnce({ audioNode: { id: "audio-new" } });
        mocks.waitForGeneration.mockResolvedValue({ job: { id: "tone-job-1", status: "succeeded" } });
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        expect(within(panel).getByRole("switch", { name: "优化语气" }).getAttribute("aria-checked")).toBe("true");
        fireEvent.click(within(panel).getByRole("button", { name: "生成本段音频" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(2));
        const firstRequest = mocks.runKouboAction.mock.calls[0][0];
        expect(firstRequest).toEqual(expect.objectContaining({
            action: "generate-tts",
            optimizeTone: true,
            toneOptimizationRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }));
        expect(firstRequest.toneOptimizationRequestId).not.toBe(firstRequest.clientRequestId);
        expect(mocks.waitForGeneration).toHaveBeenCalledWith("tone-job-1");
        expect(mocks.runKouboAction.mock.calls[1][0]).toEqual(firstRequest);
    });

    it("skips Gemini tone optimization when the Toggle is off", async () => {
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        fireEvent.click(within(panel).getByRole("switch", { name: "优化语气" }));
        fireEvent.click(within(panel).getByRole("button", { name: "生成本段音频" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledOnce());
        expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            optimizeTone: false,
        }));
        expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.not.objectContaining({
            toneOptimizationRequestId: expect.anything(),
        }));
        expect(mocks.waitForGeneration).not.toHaveBeenCalled();
    });

    it("generates only missing audio from the script group shortcut and shows its node immediately", async () => {
        mocks.workspace.segments.push({
            ...mocks.workspace.segments[0],
            id: "segment-2",
            position: 1,
            text: "第二段口播文案",
        });
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成缺失音频" }));

        await vi.waitFor(() => expect(screen.getByRole("button", { name: "音频 2" })).toBeTruthy());
        expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "generate-tts",
            projectId: "project-1",
            segmentId: "segment-2",
        }));
    });

    it("moves an optimistic audio through tone optimization and speech generation", async () => {
        mocks.workspace.segments.push({
            ...mocks.workspace.segments[0],
            id: "segment-2",
            position: 1,
            text: "第二段口播文案",
        });
        let finishTone: (value: unknown) => void = () => undefined;
        mocks.runKouboAction
            .mockResolvedValueOnce({ toneOptimizationJob: { id: "tone-job", status: "running" } })
            .mockReturnValueOnce(new Promise(() => undefined));
        mocks.waitForGeneration.mockReturnValue(new Promise((resolve) => { finishTone = resolve; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成缺失音频" }));
        const pendingAudio = await screen.findByRole("button", { name: "音频 2" });
        await vi.waitFor(() => expect(pendingAudio.parentElement?.dataset.nodeSummary).toBe("语气优化"));

        finishTone({ job: { id: "tone-job", status: "succeeded" } });
        await vi.waitFor(() => expect(pendingAudio.parentElement?.dataset.nodeSummary).toBe("语音生成"));
    });

    it("never restores a deleted optimistic audio when its persisted row arrives later", async () => {
        mocks.workspace.segments.push({
            ...mocks.workspace.segments[0],
            id: "segment-2",
            position: 1,
            text: "第二段口播文案",
        });
        let finishRequest: (value: unknown) => void = () => undefined;
        mocks.runKouboAction.mockReturnValue(new Promise((resolve) => { finishRequest = resolve; }));
        const view = render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成缺失音频" }));
        const optimistic = await screen.findByRole("button", { name: "音频 2" });
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledOnce());
        const clientRequestId = mocks.runKouboAction.mock.calls[0][0].clientRequestId as string;
        fireEvent.click(optimistic);
        fireEvent.keyDown(window, { key: "Delete" });
        expect(screen.queryByRole("button", { name: "音频 2" })).toBeNull();

        mocks.workspace.audioNodes.push({
            id: "audio-real-2",
            projectId: "project-1",
            segmentId: "segment-2",
            parentAudioNodeId: null,
            segmentationRunId: null,
            segmentIndex: null,
            assetId: null,
            durationMs: null,
            sourceType: "generated",
            sourceStartMs: null,
            sourceEndMs: null,
            sourceSegmentRevision: 1,
            status: "failed",
            imageResultId: null,
            clientRequestId,
            errorMessage: "语气优化失败",
        });
        finishRequest({ audioNode: mocks.workspace.audioNodes.at(-1) });
        view.rerender(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        await vi.waitFor(() => expect(screen.queryByRole("button", { name: "音频 2" })).toBeNull());
        expect(mocks.deleteNodes).toHaveBeenCalledWith("project-1", expect.any(Array), [clientRequestId]);
    });

    it("submits every missing segment TTS concurrently before any request finishes", async () => {
        mocks.workspace.segments.push(
            { ...mocks.workspace.segments[0], id: "segment-2", position: 1, text: "第二段口播文案" },
            { ...mocks.workspace.segments[0], id: "segment-3", position: 2, text: "第三段口播文案" },
        );
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成全部 TTS" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(2));
        expect(mocks.runKouboAction.mock.calls.map(([request]) => request.segmentId)).toEqual([
            "segment-2",
            "segment-3",
        ]);
    });

    it("keeps one audio node per segment when realtime replaces optimistic batch TTS nodes", async () => {
        mocks.workspace.segments.push({
            ...mocks.workspace.segments[0],
            id: "segment-2",
            position: 1,
            text: "第二段口播文案",
        });
        mocks.workspace.audioNodes.push({
            ...mocks.workspace.audioNodes[0],
            id: "audio-2",
            segmentId: "segment-2",
        });
        mocks.deleteNodes.mockReturnValue(new Promise(() => undefined));
        mocks.runKouboAction.mockReturnValue(new Promise(() => undefined));
        const page = () => (
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>
        );
        const view = render(page());

        fireEvent.click(screen.getByRole("button", { name: "音频 1" }));
        fireEvent.click(screen.getByRole("button", { name: "音频 2" }), { metaKey: true });
        fireEvent.keyDown(window, { key: "Delete" });
        expect(screen.queryByRole("button", { name: "音频 1" })).toBeNull();
        expect(screen.queryByRole("button", { name: "音频 2" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "口播文案组" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成全部 TTS" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(2));

        const requests = mocks.runKouboAction.mock.calls.map(([request]) => request);
        mocks.workspace.audioNodes.push(
            {
                ...mocks.workspace.audioNodes[0],
                id: "audio-new-1",
                segmentId: "segment-1",
                status: "queued",
                clientRequestId: requests.find((request) => request.segmentId === "segment-1").clientRequestId,
            },
            {
                ...mocks.workspace.audioNodes[0],
                id: "audio-new-2",
                segmentId: "segment-2",
                status: "queued",
                clientRequestId: requests.find((request) => request.segmentId === "segment-2").clientRequestId,
            },
        );
        view.rerender(page());

        expect(screen.getAllByRole("button", { name: "音频 1" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "音频 2" })).toHaveLength(1);
    });

    it("keeps a failed segment audio node visible when the other concurrent requests succeed", async () => {
        mocks.workspace.segments.push({
            ...mocks.workspace.segments[0],
            id: "segment-2",
            position: 1,
            text: "第二段口播文案",
        });
        mocks.runKouboAction.mockImplementation(({ segmentId }: { segmentId: string }) =>
            segmentId === "segment-2" ? Promise.reject(new Error("Signal timed out.")) : Promise.resolve({}));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "生成全部 TTS" }));

        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        expect(screen.getByRole("button", { name: "音频 2" })).toBeTruthy();
    });

    it("edits segment text and voice direction inline and saves on blur without transform controls", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        const panel = screen.getByLabelText("口播节点设置面板");
        const text = within(panel).getByLabelText("文案内容");
        const direction = within(panel).getByLabelText("语气指导");
        expect((text as HTMLTextAreaElement).value).toBe("第一段口播文案");
        expect((direction as HTMLTextAreaElement).value).toBe("自然");
        expect(within(panel).queryByRole("button", { name: "拆分文案段" })).toBeNull();
        expect(within(panel).queryByRole("button", { name: "与下一文案段合并" })).toBeNull();

        fireEvent.change(text, { target: { value: "更新后的文案" } });
        fireEvent.blur(text);
        await vi.waitFor(() => expect(mocks.editSegment).toHaveBeenCalledWith({
            segmentId: "segment-1",
            text: "更新后的文案",
            voiceDirection: "自然",
            expectedRevision: 1,
        }));
    });

    it("updates the segment node before saving and restores it when the edit fails", async () => {
        let rejectEdit: (error: Error) => void = () => undefined;
        mocks.editSegment.mockReturnValue(new Promise((_, reject) => { rejectEdit = reject; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "文案 1" }));
        const text = within(screen.getByLabelText("口播节点设置面板")).getByLabelText("文案内容");
        fireEvent.change(text, { target: { value: "立即显示的新文案" } });
        fireEvent.blur(text);

        const node = document.querySelector('[data-node-id="koubo-segment-segment-1"]')!;
        expect(node.getAttribute("data-node-summary")).toBe("立即显示的新文案");
        rejectEdit(new Error("口播文案保存失败"));

        await vi.waitFor(() => expect(node.getAttribute("data-node-summary")).toBe("第一段口播文案"));
        expect((text as HTMLTextAreaElement).value).toBe("第一段口播文案");
    });

    it("keeps direct regenerate and guided optimization on the single text node", async () => {
        mocks.runKouboAction.mockResolvedValue({
            job: { id: "job-segment", status: "succeeded" },
            segment: { id: "segment-1" },
        });
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "生成本段文案" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "regenerate-segment",
            projectId: "project-1",
            segmentId: "segment-1",
        })));
        expect(mocks.runKouboAction.mock.calls[0][0]).not.toHaveProperty("direction");

        fireEvent.click(screen.getByRole("button", { name: "按要求优化本段文案" }));
        fireEvent.click(screen.getByRole("button", { name: "提交单段优化" }));
        await vi.waitFor(() => expect(mocks.runKouboAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "regenerate-segment",
            projectId: "project-1",
            segmentId: "segment-1",
            direction: "说得更适合小朋友",
        })));
    });

    it("supports additive node selection and expands a group selection to text and audio downloads", () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const segment = screen.getByRole("button", { name: "文案 1" });
        const audio = screen.getByRole("button", { name: "音频 1" });
        fireEvent.click(segment);
        fireEvent.click(audio, { metaKey: true });
        expect(segment.getAttribute("data-selected")).toBe("true");
        expect(audio.getAttribute("data-selected")).toBe("true");
        fireEvent.contextMenu(audio);
        expect(screen.getByRole("button", { name: "下载选中内容（2）" })).not.toBeNull();

        fireEvent.pointerDown(document.body);
        fireEvent.contextMenu(screen.getByRole("button", { name: "口播文案组" }));
        expect(screen.getByRole("button", { name: "下载选中内容（2）" })).not.toBeNull();
    });

    it.each(["Backspace", "Delete"])("deletes selected nodes and descendants with %s but ignores text editing", async (key) => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const segment = screen.getByRole("button", { name: "文案 1" });
        fireEvent.click(segment);
        const text = within(screen.getByLabelText("口播节点设置面板")).getByLabelText("文案内容");
        fireEvent.keyDown(text, { key });
        expect(mocks.deleteNodes).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key });
        await vi.waitFor(() => expect(mocks.deleteNodes).toHaveBeenCalledWith("project-1", [
            "koubo-segment-segment-1",
            "koubo-audio-audio-1",
        ], []));
    });

    it.each(["Backspace", "Delete"])("unlinks the selected audio-to-image connection with %s without deleting either node", async (key) => {
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "asset-image-1",
            url: "/image.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
            clientRequestId: "image-request-1",
        }];
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const connection = screen.getByRole("button", {
            name: "连接线 koubo-audio-audio-1-koubo-image-image-1",
        });
        fireEvent.click(connection);
        expect(connection.getAttribute("data-active")).toBe("true");

        fireEvent.keyDown(window, { key });

        await vi.waitFor(() => expect(mocks.unlinkAudioImage).toHaveBeenCalledWith("audio-1", "image-1"));
        expect(mocks.deleteNodes).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "音频 1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "角色口播图 1" })).toBeTruthy();
    });

    it("shows a new audio-to-image connection before the request finishes and restores it on failure", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "asset-image-1",
            url: "/image.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
            clientRequestId: "image-request-1",
        }];
        let rejectLink: (error: Error) => void = () => undefined;
        mocks.linkAudioImage.mockReturnValue(new Promise((_, reject) => { rejectLink = reject; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "音频 1" }));
        fireEvent.click(within(screen.getByLabelText("口播节点设置面板")).getByRole("button", { name: "连接角色图片" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "角色口播图 1" }));

        const label = "连接线 koubo-audio-audio-1-koubo-image-image-1";
        expect(screen.getByRole("button", { name: label })).toBeTruthy();
        rejectLink(new Error("角色口播图连接失败"));
        await vi.waitFor(() => expect(screen.queryByRole("button", { name: label })).toBeNull());
    });

    it("removes an audio-to-image connection before the request finishes and restores it on failure", async () => {
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "asset-image-1",
            url: "/image.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
            clientRequestId: "image-request-1",
        }];
        let rejectUnlink: (error: Error) => void = () => undefined;
        mocks.unlinkAudioImage.mockReturnValue(new Promise((_, reject) => { rejectUnlink = reject; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const label = "连接线 koubo-audio-audio-1-koubo-image-image-1";
        fireEvent.click(screen.getByRole("button", { name: label }));
        fireEvent.keyDown(window, { key: "Delete" });

        expect(screen.queryByRole("button", { name: label })).toBeNull();
        rejectUnlink(new Error("首帧连接解除失败"));
        expect(await screen.findByRole("button", { name: label })).toBeTruthy();
    });

    it("removes an audio subtree before the delete request finishes", async () => {
        mocks.workspace.audioNodes.push({
            ...mocks.workspace.audioNodes[0],
            id: "audio-child",
            parentAudioNodeId: "audio-1",
            sourceType: "segment",
            segmentIndex: 0,
        } as typeof mocks.workspace.audioNodes[number]);
        mocks.deleteNodes.mockReturnValue(new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "音频 1" }));
        fireEvent.keyDown(window, { key: "Delete" });

        await vi.waitFor(() => {
            expect(screen.queryByRole("button", { name: "音频 1" })).toBeNull();
            expect(screen.queryByRole("button", { name: "音频 1 · 片段 1" })).toBeNull();
        });
    });

    it("keeps concurrent video deletes independent while their requests settle", async () => {
        mocks.workspace.imageResults = [{
            id: "image-1",
            projectId: "project-1",
            sourceType: "upload",
            assetId: "image-asset",
            url: "/role.png",
            prompt: "",
            aspectRatio: "16:9",
            status: "ready",
        }];
        mocks.workspace.audioNodes[0].imageResultId = "image-1";
        mocks.workspace.videoCandidates = ["video-1", "video-2"].map((id, index) => ({
            id,
            projectId: "project-1",
            segmentId: "segment-1",
            audioNodeId: "audio-1",
            imageResultId: "image-1",
            assetId: `video-asset-${index + 1}`,
            url: `/talking-head-${index + 1}.mp4`,
            mimeType: "video/mp4",
            sourceSegmentRevision: 1,
            status: "ready" as const,
            selected: false,
            generationId: `job-${id}`,
            clientRequestId: `request-${id}`,
            errorMessage: null,
            progress: 100,
        }));
        let rejectFirstDelete: (error: Error) => void = () => undefined;
        mocks.deleteNodes
            .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirstDelete = reject; }))
            .mockImplementation(() => new Promise(() => undefined));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        const firstVideo = () => document.querySelector<HTMLElement>('[data-node-id="koubo-video-video-1"]');
        const secondVideo = () => document.querySelector<HTMLElement>('[data-node-id="koubo-video-video-2"]');
        fireEvent.click(within(firstVideo()!).getByRole("button", { name: /^口播视频/ }));
        fireEvent.keyDown(window, { key: "Delete" });
        await vi.waitFor(() => expect(firstVideo()).toBeNull());

        fireEvent.click(within(secondVideo()!).getByRole("button", { name: /^口播视频/ }));
        fireEvent.keyDown(window, { key: "Delete" });

        await vi.waitFor(() => expect(secondVideo()).toBeNull());
        expect(mocks.deleteNodes).toHaveBeenCalledTimes(2);
        expect(mocks.deleteNodes).toHaveBeenNthCalledWith(1, "project-1", ["koubo-video-video-1"], []);
        expect(mocks.deleteNodes).toHaveBeenNthCalledWith(2, "project-1", ["koubo-video-video-2"], []);

        act(() => rejectFirstDelete(new Error("第一个视频删除失败")));
        await vi.waitFor(() => expect(firstVideo()).not.toBeNull());
        expect(within(firstVideo()!).getByRole("button", { name: /^口播视频/ }).getAttribute("data-selected")).toBe("false");
        expect(secondVideo()).toBeNull();
    });

    it("keeps a deleted audio hidden when backend cleanup fails", async () => {
        let rejectDelete: (error: Error) => void = () => undefined;
        mocks.deleteNodes.mockReturnValue(new Promise((_, reject) => { rejectDelete = reject; }));
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <MemoryRouter initialEntries={["/content/koubo-video/project-1"]}>
                    <Routes>
                        <Route path="/content/koubo-video/:projectId" element={<KouboVideoPage />} />
                    </Routes>
                </MemoryRouter>
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "音频 1" }));
        fireEvent.keyDown(window, { key: "Delete" });
        expect(screen.queryByRole("button", { name: "音频 1" })).toBeNull();
        rejectDelete(new Error("节点删除失败"));

        await vi.waitFor(() => expect(screen.queryByRole("button", { name: "音频 1" })).toBeNull());
    });

});
