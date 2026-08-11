// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentGenerationRun, ContentModelPromptBinding, ContentModelPromptVersion, ContentNode } from "@/types/content-production";
import * as promptTuning from "./content-model-prompt-tuning";
import { ContentNodePanelTabs } from "./content-node-panel-tabs";

const {
    ContentModelPromptTuning,
    contentModelPromptGroups,
    contentModelPromptIsDirty,
} = promptTuning;

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
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

vi.mock("../use-content-production", () => ({
    useContentModelPromptVersionsQuery: (stage: string) => ({ data: versions.filter((version) => version.stage === stage), isLoading: false, isError: false, refetch: vi.fn() }),
    useSaveContentModelPromptVersionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useActivateContentModelPromptVersionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const bindings: ContentModelPromptBinding[] = [
    { promptId: "used-review", stage: "topic_factory", purposeKey: "review", purposeLabel: "质量检查", modelId: "glm", version: 1 },
    { promptId: "used-humanize", stage: "topic_factory", purposeKey: "humanize", purposeLabel: "去 AI 化", modelId: "glm", version: 2 },
];

const storylineBindings: ContentModelPromptBinding[] = [
    { promptId: "storyline-generate-v2", stage: "storyline_script", purposeKey: "generate", purposeLabel: "内容生成", modelId: "gemini", version: 2 },
    { promptId: "storyline-repair-v2", stage: "storyline_script", purposeKey: "repair", purposeLabel: "内容返修", modelId: "gemini", version: 2 },
    { promptId: "storyline-review-v2", stage: "storyline_script", purposeKey: "review", purposeLabel: "质量检查", modelId: "storyline-glm", version: 2 },
];

function stagePrompt(binding: ContentModelPromptBinding, patch: Partial<ContentModelPromptVersion> = {}): ContentModelPromptVersion {
    return {
        promptId: binding.promptId,
        stage: binding.stage,
        purposeKey: binding.purposeKey,
        purposeLabel: binding.purposeLabel,
        version: binding.version,
        systemPrompt: "",
        active: true,
        createdBy: null,
        createdAt: "",
        activatedBy: null,
        activatedAt: null,
        ...patch,
    };
}

const versions: ContentModelPromptVersion[] = [
    stagePrompt(bindings[0], { promptId: "active-review", version: 3, systemPrompt: "当前检查" }),
    stagePrompt(bindings[0], { systemPrompt: "历史检查", active: false }),
    stagePrompt(bindings[1], { systemPrompt: "当前去 AI" }),
    stagePrompt(storylineBindings[0], { systemPrompt: "下一次故事线生成 Prompt" }),
    stagePrompt(storylineBindings[1], { systemPrompt: "旧的故事线返修 Prompt" }),
    stagePrompt(storylineBindings[2], { systemPrompt: "故事线质量检查 Prompt" }),
    {
        promptId: "koubo-tone-v1",
        stage: "koubo_script",
        purposeKey: "optimize_tts_tone",
        purposeLabel: "TTS 语气优化",
        version: 1,
        systemPrompt: "口播语气优化 Prompt",
        active: true,
        createdBy: null,
        createdAt: "",
        activatedBy: null,
        activatedAt: null,
    },
    ...["generate", "generate_full", "regenerate_segment", "optimize_tts_tone"].map((purposeKey, index) => ({
        promptId: `course-shared-${purposeKey}`,
        stage: "course_script" as const,
        purposeKey,
        purposeLabel: `课程用途 ${index + 1}`,
        version: 1,
        systemPrompt: `共享课程 Prompt ${index + 1}`,
        active: true,
        createdBy: null,
        createdAt: "",
        activatedBy: null,
        activatedAt: null,
    })),
];

const run = {
    stage: "topic_factory",
    modelPromptBindings: [bindings[0]],
} as ContentGenerationRun;

afterEach(cleanup);

describe("content model Prompt tuning", () => {
    it("falls back to Topic Factory prompts while a topic branch is waiting for its real run", () => {
        const resolve = (promptTuning as unknown as {
            contentModelPromptFallbackStage?: (
                node: ContentNode | null,
                run: ContentGenerationRun | null,
            ) => ContentModelPromptBinding["stage"] | undefined;
        }).contentModelPromptFallbackStage;
        const topicBranch = {
            nodeType: "angle",
            data: {
                topicFactory: {
                    version: 2,
                    batchId: "batch-1",
                    laneNumber: 1,
                    laneStrategy: "反常识",
                    phase: "generating",
                    reviewCycle: 1,
                    runId: "run-1",
                },
            },
        } as ContentNode;

        expect(resolve?.(topicBranch, null)).toBe("topic_factory");
        expect(resolve?.(topicBranch, run)).toBeUndefined();
    });

    it("falls back to storyboard prompts before the producing run is available", () => {
        const storyboardNode = {
            nodeType: "batch",
            data: {
                storyboardWorkflow: {
                    operation: "generate",
                    phase: "producer_running",
                    runId: "storyboard-run",
                    sourceNodeId: "storyline-1",
                    groupId: "storyboard-group",
                },
            },
        } as ContentNode;

        expect(promptTuning.contentModelPromptFallbackStage(storyboardNode, null)).toBe("shot_breakdown");
        expect(promptTuning.contentModelPromptFallbackStage(storyboardNode, run)).toBeUndefined();
    });

    it("only groups Prompt combinations bound to the producing run", () => {
        const groups = contentModelPromptGroups(bindings, versions);
        expect(groups.map((group) => group.key)).toEqual(["review", "humanize"]);
        expect(groups[0]).toMatchObject({
            label: "质量检查",
            usedVersion: 1,
            activeVersion: { version: 3, systemPrompt: "当前检查" },
        });
        expect(groups[0].versions).toHaveLength(2);
    });

    it("shows only generation and quality review prompts for Storyline", () => {
        expect(contentModelPromptGroups(storylineBindings, versions).map((group) => group.key)).toEqual([
            "generate",
            "review",
        ]);
        expect(contentModelPromptGroups(bindings, versions).map((group) => group.key)).toEqual([
            "review",
            "humanize",
        ]);
    });

    it("reports unsaved changes only when the active Prompt body changes", () => {
        expect(contentModelPromptIsDirty("当前检查", versions[0])).toBe(false);
        expect(contentModelPromptIsDirty("调整后的检查", versions[0])).toBe(true);
        expect(contentModelPromptIsDirty("", undefined)).toBe(false);
    });

    it("keeps a dedicated 16px gap above the save action", () => {
        const html = renderToStaticMarkup(
            <App>
                <ContentModelPromptTuning run={run} onDirtyChange={() => undefined} />
            </App>,
        );

        expect(html).toMatch(/class="pt-4"><button[^>]*>.*保存新版本/s);
    });

    it("lets a failed optimistic Storyline edit active prompts for the next start", () => {
        render(
            <App>
                <ContentModelPromptTuning
                    run={null}
                    fallbackStage="storyline_script"
                    onDirtyChange={() => undefined}
                />
            </App>,
        );

        expect(screen.getByText("下次启动使用")).toBeTruthy();
        expect(screen.getByText("这是当前激活配置，不是历史运行快照。")).toBeTruthy();
        fireEvent.change(screen.getByDisplayValue("下一次故事线生成 Prompt"), {
            target: { value: "优化后的下一次故事线 Prompt" },
        });
        expect(screen.getByRole("button", { name: "保存新版本" }).hasAttribute("disabled")).toBe(false);
    });

    it("keeps a real run on its exact prompt binding snapshot", () => {
        render(
            <App>
                <ContentModelPromptTuning
                    run={run}
                    fallbackStage="storyline_script"
                    onDirtyChange={() => undefined}
                />
            </App>,
        );

        expect(screen.getByText("此节点使用 v1")).toBeTruthy();
        expect(screen.queryByText("下次启动使用")).toBeNull();
        expect(screen.queryByText("这是当前激活配置，不是历史运行快照。")).toBeNull();
    });

    it("adds an explicitly included active Prompt beside a real run binding", () => {
        render(
            <App>
                <ContentModelPromptTuning
                    run={{ ...run, stage: "koubo_script" }}
                    includeActivePurposes={["optimize_tts_tone"]}
                    onDirtyChange={() => undefined}
                />
            </App>,
        );

        fireEvent.mouseDown(screen.getByRole("combobox"));
        expect(screen.getByText("TTS 语气优化")).toBeTruthy();
    });

    it("uses one shared course Prompt for every available project model", () => {
        const onChange = vi.fn();
        render(
            <App>
                <ContentModelPromptTuning
                    run={null}
                    fallbackStage="course_script"
                    promptPurposeKey="generate"
                    modelSelection={{
                        stage: "course_script",
                        label: "课程文案模型",
                        value: "gemini-option",
                        options: [
                            { value: "gemini-option", modelId: "gemini-course", label: "Gemini Course" },
                            { value: "ark-option", modelId: "ark-course", label: "Ark Course" },
                        ],
                        requiredPurposeKeys: ["generate", "generate_full", "regenerate_segment", "optimize_tts_tone"],
                        loading: false,
                        onChange,
                    }}
                    onDirtyChange={() => undefined}
                />
            </App>,
        );

        const selectors = screen.getAllByRole("combobox");
        expect(selectors).toHaveLength(1);
        fireEvent.mouseDown(selectors[0]);
        expect(screen.getAllByText("Ark Course").length).toBeGreaterThan(0);
        expect(screen.queryByText("Ark Course（Prompt 未配置完整）")).toBeNull();
        expect(screen.getByText("课程文案")).toBeTruthy();
        expect(screen.queryByText("模型与用途")).toBeNull();
        expect(screen.getByDisplayValue("共享课程 Prompt 1")).toBeTruthy();
    });

    it("shows the selected course model active Prompt instead of the node history snapshot", () => {
        render(
            <App>
                <ContentModelPromptTuning
                    run={{
                        ...run,
                        stage: "koubo_script",
                        modelPromptBindings: [{
                            promptId: "koubo-tone-v1",
                            stage: "koubo_script",
                            purposeKey: "optimize_tts_tone",
                            purposeLabel: "TTS 语气优化",
                            modelId: "gemini-lite",
                            version: 1,
                        }],
                    }}
                    fallbackStage="course_script"
                    promptPurposeKey="generate"
                    modelSelection={{
                        stage: "course_script",
                        label: "课程文案模型",
                        value: "gemini-option",
                        options: [{ value: "gemini-option", modelId: "gemini-course", label: "Gemini Course" }],
                        requiredPurposeKeys: ["generate", "generate_full", "regenerate_segment", "optimize_tts_tone"],
                        loading: false,
                        onChange: () => undefined,
                    }}
                    onDirtyChange={() => undefined}
                />
            </App>,
        );

        fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
        expect(screen.getAllByText("Gemini Course").length).toBeGreaterThan(0);
        expect(screen.queryByText("Gemini Course（Prompt 未配置完整）")).toBeNull();
        expect(screen.queryByText("模型与用途")).toBeNull();
        expect(screen.getByDisplayValue("共享课程 Prompt 1")).toBeTruthy();
        expect(screen.getByText("下次启动使用")).toBeTruthy();
        expect(screen.queryByDisplayValue("口播语气优化 Prompt")).toBeNull();
    });

    it("opens the complete Prompt version preview in a dialog", async () => {
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <App>
                    <ContentModelPromptTuning run={run} onDirtyChange={() => undefined} />
                </App>
            </ConfigProvider>,
        );

        const previewButton = screen.getAllByRole("button", { name: "预览" })[1];
        previewButton.focus();
        fireEvent.click(previewButton);

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("v1 Prompt 预览")).toBeTruthy();
        expect(within(dialog).queryByText("GLM 5.2")).toBeNull();
        expect(within(dialog).getByText("质量检查")).toBeTruthy();
        expect(within(dialog).getByText("历史版本")).toBeTruthy();
        expect(within(dialog).getByText("创建时间")).toBeTruthy();
        const prompt = within(dialog).getByDisplayValue("历史检查");
        expect(screen.getAllByDisplayValue("历史检查")).toEqual([prompt]);

        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(screen.getAllByRole("button", { name: "预览" })).toHaveLength(2);
        expect(document.activeElement).toBe(previewButton);
    });

    it("does not expose the tuning tab to a normal user", () => {
        const html = renderToStaticMarkup(
            <ContentNodePanelTabs
                activeKey="content"
                tuningEnabled={false}
                content={<div>节点内容</div>}
                tuning={<div>System Prompt</div>}
                onChange={() => undefined}
            />,
        );
        expect(html).toContain("节点内容");
        expect(html).not.toContain("提示词调优");
        expect(html).not.toContain("AI 调优");
        expect(html).not.toContain("System Prompt");
    });

    it("labels the superuser tab as Prompt tuning", () => {
        const html = renderToStaticMarkup(
            <ContentNodePanelTabs
                activeKey="tuning"
                tuningEnabled
                content={<div>节点内容</div>}
                tuning={<div>System Prompt</div>}
                onChange={() => undefined}
            />,
        );
        expect(html).toContain("提示词调优");
        expect(html).not.toContain("AI 调优");
    });

    it("insets the shared panel tab header from the panel edge", () => {
        const html = renderToStaticMarkup(
            <ContentNodePanelTabs
                activeKey="content"
                tuningEnabled
                content={<div>节点内容</div>}
                tuning={<div>System Prompt</div>}
                onChange={() => undefined}
            />,
        );

        expect(html).toMatch(/class="ant-tabs-nav"[^>]*style="[^"]*padding-inline:24px/);
    });
});
