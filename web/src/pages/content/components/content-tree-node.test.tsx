import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentTreeNode, shouldActivateContentTreeNode } from "./content-tree-node";
import { getAntThemeConfig } from "@/lib/app-theme";
import type { ContentNode, ContentTopicFactorySnapshot } from "@/types/content-production";

const acceptedNode: ContentNode = {
    id: "angle-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "orientation-1",
    nodeType: "angle",
    title: "具体选题",
    summary: "核心爆点",
    sortOrder: 1,
    status: "succeeded",
    revision: 1,
    createdBy: "user-1",
    hiddenAt: null,
    createdAt: "2026-07-27T00:00:00Z",
    updatedAt: "2026-07-27T00:00:00Z",
    data: {
        topicFactory: {
            version: 2,
            batchId: "batch-1",
            laneNumber: 1,
            laneStrategy: "反常识切入",
            phase: "ready_pass",
            reviewCycle: 1,
            runId: "run-1",
            latestGeminiInteractionId: "interaction-1",
            candidate: {
                title: "具体选题",
                core_hook: "核心爆点",
                target_audience: { segment: "目标人群", need_or_anxiety: "真实焦虑" },
                specific_situation: "具体场景",
                core_conflict: "核心冲突",
                twist_or_gap: "信息差",
                payoff: { type: "practical", description: "行动回报" },
                share_motivation: "收藏备用",
                story_promise: "讲清楚选择和结果",
                evidence_requirements: [],
                tags: ["决策"],
            },
            citations: [],
            review: {
                verdict: "pass",
                total_score: 96,
                dimension_scores: {
                    audience_relevance: 30,
                    specificity: 20,
                    conflict_or_information_gap: 20,
                    payoff: 15,
                    credibility: 6,
                    content_fit: 5,
                },
                blocking_issues: [],
                critical_information: [],
                feedback_to_gemini: {
                    missing_critical_information: [],
                    revision_instructions: [],
                    require_google_search: false,
                },
            },
            score: 96,
            warning: null,
            error: null,
        },
    },
};

const factoryOf = (node: ContentNode) => node.data.topicFactory as ContentTopicFactorySnapshot;

describe("ContentTreeNode", () => {
    it("keeps Space available to the optimization textarea instead of activating the parent node", () => {
        const nodeTarget = new EventTarget();
        const textareaTarget = new EventTarget();

        expect(shouldActivateContentTreeNode(" ", textareaTarget, nodeTarget)).toBe(false);
        expect(shouldActivateContentTreeNode(" ", nodeTarget, nodeTarget)).toBe(true);
    });

    it("does not expose the internal revision counter", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={acceptedNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).not.toContain(">v1<");
    });

    it("previews a ready TTS node directly in the node", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    id: "tts-1",
                    nodeType: "tts",
                    title: "角色语音",
                    summary: "",
                    data: { url: "/speech.wav", durationMs: 2400 },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain('aria-label="预览 角色语音"');
        expect(html).toContain('src="/speech.wav"');
        expect(html).toContain("2.4 秒");
    });

    it("renders a ready talking-head video as a playable in-node video", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    id: "video-1",
                    nodeType: "video",
                    title: "口播视频 1",
                    summary: "",
                    data: { url: "/talking-head.mp4" },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain('aria-label="播放 口播视频 1"');
        expect(html).toContain('src="/talking-head.mp4"');
        expect(html).toContain("controls");
        expect(html).toContain("data-canvas-no-zoom");
        expect(html).toContain("aspect-video");
        expect(html).toContain("object-contain");
        expect(html).not.toContain("pointer-events-none");
    });

    it("places video download immediately before regenerate in the node footer", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    id: "video-actions",
                    nodeType: "video",
                    title: "口播视频 1",
                    summary: "",
                    data: { url: "/talking-head.mp4" },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                downloadTitle="下载口播视频"
                onDownload={() => undefined}
                regenerateTitle="重新生成口播视频"
                onRegenerate={() => undefined}
            />,
        );

        const downloadIndex = html.indexOf('aria-label="下载口播视频"');
        const regenerateIndex = html.indexOf('aria-label="重新生成口播视频"');
        expect(downloadIndex).toBeGreaterThan(-1);
        expect(regenerateIndex).toBeGreaterThan(downloadIndex);
    });

    it("places audio download immediately after regenerate when requested", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    id: "audio-actions",
                    nodeType: "tts",
                    title: "角色语音 1",
                    summary: "",
                    data: { url: "/speech.wav" },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                downloadTitle="下载音频"
                onDownload={() => undefined}
                downloadAfterRegenerate
                regenerateTitle="生成本段音频"
                onRegenerate={() => undefined}
            />,
        );

        const regenerateIndex = html.indexOf('aria-label="生成本段音频"');
        const downloadIndex = html.indexOf('aria-label="下载音频"');
        expect(regenerateIndex).toBeGreaterThan(-1);
        expect(downloadIndex).toBeGreaterThan(regenerateIndex);
    });

    it("keeps preview controls in a compact ready TTS node without duration or repeated state", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    id: "tts-compact",
                    nodeType: "tts",
                    title: "角色语音",
                    summary: "已生成",
                    status: "succeeded",
                    data: { url: "/speech.wav", durationMs: 2400, compactStatusOnly: true },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain("min-height:176px");
        expect(html).toContain('aria-label="预览 角色语音"');
        expect(html).toContain('src="/speech.wav"');
        expect(html).not.toContain("2.4 秒");
        expect(html.match(/已生成/g)).toHaveLength(1);
    });

    it("renders a ready music node at compact height without repeating its status", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "music", title: "背景音乐", summary: "已生成", status: "succeeded", data: { url: "/music.mp3" } }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain("min-height:144px");
        expect(html.match(/已生成/g)).toHaveLength(1);
    });

    it("exposes the standard source handle only when a node can create a connection", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "tts", title: "角色语音" }}
                x={0}
                y={0}
                selected
                onSelect={() => undefined}
                onConnectStart={() => undefined}
                connectTitle="从角色语音连接角色口播图"
            />,
        );

        expect(html).toContain('aria-label="从角色语音连接角色口播图"');
        expect(html).toContain("cursor-crosshair");
    });

    it("renders a role image as a large uploadable role talking image node", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "image", title: "角色口播图 1", data: { roleImage: true, url: "/role.png" } }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                onImagePick={() => undefined}
                onImageFile={() => undefined}
            />,
        );

        expect(html).toContain("min-height:260px");
        expect(html).toContain("角色口播图");
        expect(html).not.toContain("分镜图");
        expect(html).toContain('aria-label="查看角色口播图大图"');
        expect(html).toContain('aria-label="重新上传角色口播图"');
        expect(html).toContain('aria-label="从素材库替换角色口播图"');
        expect(html).toContain("size-8");
        expect(html).toContain("rounded-lg");
        expect(html).toContain('alt="角色口播图" class="block h-auto w-full"');
        expect(html).not.toContain("aspect-video w-full overflow-hidden");
    });

    it("shows the generating state only once at the bottom of a role talking image node", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    nodeType: "image",
                    title: "角色口播图 1",
                    summary: "生成中",
                    status: "running",
                    data: { roleImage: true },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html.match(/生成中/g)).toHaveLength(1);
    });

    it("shows a queued video without a generating spinner", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    nodeType: "video",
                    title: "口播视频 1",
                    summary: "排队中",
                    status: "running",
                    data: { generationStage: "queued" },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain("排队中");
        expect(html).not.toContain("生成中");
        expect(html).not.toContain("animate-spin");
    });

    it("shows an accepted verification score as a semantic badge", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={acceptedNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain("96 分");
        expect(html).toContain("ant-tag-green");
        expect(html).toContain(">选题分支 1</span>");
        expect(html).toContain('class="text-[11px]" style="color:#78716c">反常识切入</span>');
        expect(html).toContain("具体选题");
        expect(html).toContain("核心爆点");
        expect(html).not.toContain("爆点、场景和回报均清晰。");
        expect(html).not.toContain("目标人群");
    });

    it("shows the complete topic title and grows above a minimum height", () => {
        const longTitle = "这是一个必须完整显示且不能只保留前两行的超长选题标题，它需要继续展示后半段的医疗信息来源核验重点";
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...acceptedNode,
                    title: longTitle,
                    data: {
                        ...acceptedNode.data,
                        topicFactory: {
                            ...factoryOf(acceptedNode),
                            candidate: {
                                ...factoryOf(acceptedNode).candidate!,
                                title: longTitle,
                            },
                        },
                    },
                }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(html).toContain(longTitle);
        expect(html).not.toContain("line-clamp-2 text-[15px]");
        expect(html).toContain("min-height:224px");
        expect(html).not.toMatch(/style="[^"]*(?<!min-)height:\d+px/);
    });

    it("shows at most three lines of reasoning only while the job is running", () => {
        const runningNode: ContentNode = {
            ...acceptedNode,
            status: "running",
            data: {
                ...acceptedNode.data,
                topicFactory: {
                    ...factoryOf(acceptedNode),
                    phase: "generating",
                    review: null,
                },
            },
        };
        const runningHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={runningNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                jobs={[{ id: "job-1", status: "running", reasoning_text: "第一行\n第二行\n第三行\n第四行" }]}
            />,
        );
        const completedHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={runningNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                jobs={[{ id: "job-1", status: "succeeded", reasoning_text: "已经完成的思考" }]}
            />,
        );

        expect(runningHtml).toContain("第一行");
        expect(runningHtml).toContain("height:3rem");
        expect(completedHtml).not.toContain("已经完成的思考");
        expect(completedHtml).not.toContain("思考过程");
    });

    it("uses the standard content node to show a plain text generation job", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "text", title: "口播文案生成", summary: "第一段内容", status: "running", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                jobs={[{ id: "job-text", status: "running", reasoning_text: "正在拆分口播段落", output_text: "第一段内容" }]}
            />,
        );
        expect(html).toContain("正在拆分口播段落");
        expect(html).toContain("第一段内容");
    });

    it("exposes the shared collapse action for non-storyboard group nodes", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "script", title: "口播文案组", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                collapsibleLabel="口播文案段"
                onToggleCollapse={() => undefined}
            />,
        );
        expect(html).toContain('aria-label="收起口播文案段"');
    });

    it("can replace the visible collapse action with an audio shortcut while keeping double-click collapse", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "script", title: "口播文案组", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                stackCount={3}
                collapsibleLabel="口播文案段"
                onToggleCollapse={() => undefined}
                showCollapseAction={false}
                quickActionTitle="生成缺失音频"
                onQuickAction={() => undefined}
            />,
        );
        expect(html).toContain('aria-label="生成缺失音频"');
        expect(html).not.toContain('aria-label="收起口播文案段"');
    });

    it("uses the shared canvas stack treatment for batched text nodes", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "script", title: "口播文案组", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                stackCount={4}
            />,
        );
        expect(html.match(/data-stack-layer=/g)).toHaveLength(3);
    });

    it("exposes a node-specific regenerate action for fixed workflow nodes", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "text", title: "文案 1", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                regenerateTitle="重新生成本段文案"
                onRegenerate={() => undefined}
            />,
        );
        expect(html).toContain('aria-label="重新生成本段文案"');
    });

    it("exposes guided optimization beside regenerate for a single text node", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, nodeType: "text", title: "文案 1", data: {} }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                regenerateTitle="重新生成本段文案"
                onRegenerate={() => undefined}
                optimizeTitle="按要求优化本段文案"
                optimizeOpen
                onToggleOptimize={() => undefined}
                onOptimize={async () => undefined}
            />,
        );
        expect(html).toContain('aria-label="重新生成本段文案"');
        expect(html).toContain('aria-label="按要求优化本段文案"');
        expect(html).toContain('placeholder="输入优化方向"');
    });

    it("lets the owner stop a running Topic Factory branch and regenerate after cancellation", () => {
        const runningNode: ContentNode = {
            ...acceptedNode,
            status: "running",
            data: {
                ...acceptedNode.data,
                topicFactory: {
                    ...factoryOf(acceptedNode),
                    phase: "reviewing",
                },
            },
        };
        const runningHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={runningNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                onRegenerate={() => undefined}
                onStop={() => undefined}
                jobs={[{ id: "job-1", status: "running" }]}
            />,
        );
        const stoppedHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={{
                    ...runningNode,
                    status: "idle",
                    data: {
                        ...runningNode.data,
                        topicFactory: {
                            ...factoryOf(runningNode),
                            phase: "canceled",
                        },
                    },
                } as ContentNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                onRegenerate={() => undefined}
                jobs={[{ id: "job-1", status: "canceled" }]}
            />,
        );

        expect(runningHtml).toContain('aria-label="停止这个选题"');
        expect(runningHtml).toContain(">停止<");
        expect(stoppedHtml).toContain("已停止");
        expect(stoppedHtml).toContain('aria-label="重新生成这个选题"');
        expect(stoppedHtml).not.toContain('disabled="" aria-label="重新生成这个选题"');
    });

    it("offers recursive optimization and shows an unread failure dot", () => {
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, status: "failed", noticeKind: "failure", noticeUnread: true }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                onToggleOptimize={() => undefined}
            />,
        );

        expect(html).toContain('aria-label="优化这个选题"');
        expect(html).toContain("生成失败，未查看");
    });

    it("shows Storyline V2 score, reasoning, optimize, and rebuild controls", () => {
        const storyNode: ContentNode = {
            ...acceptedNode,
            id: "story-1",
            parentId: acceptedNode.id,
            nodeType: "storyline",
            title: "故事线",
            status: "running",
            data: {
                storylineWorkflow: {
                    operation: "optimize",
                    phase: "reviewer_running",
                    round: 2,
                    runId: "story-run-1",
                    sourceNodeId: "story-0",
                    upstreamAngleNodeId: acceptedNode.id,
                    parentInteractionId: "story-interaction-1",
                    latestGeminiInteractionId: "story-interaction-2",
                    optimizationDirection: "加强反转",
                    candidate: {
                        format: "crocotv.storyline",
                        version: 2,
                        positioning: {
                            core_narrative_anchor: "杯色让同一杯咖啡得到相反判断",
                            emotional_value: "好奇 → 震惊 → 爽快",
                        },
                    },
                    review: { total_score: 88 },
                    lastError: null,
                },
            },
        };
        const html = renderToStaticMarkup(
            <ContentTreeNode
                node={storyNode}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
                onToggleOptimize={() => undefined}
                onRegenerate={() => undefined}
                jobs={[{ id: "job-story", status: "running", reasoning_text: "正在检查反转是否成立" }]}
            />,
        );

        expect(html).toContain("故事线 V2");
        expect(html).toContain("88 分");
        expect(html).toContain("正在检查反转是否成立");
        expect(html).toContain('aria-label="优化这个故事线"');
        expect(html).toContain('aria-label="重构这个故事线"');
    });

    it("uses a blue border without a visible dot for unread successful output", () => {
        const unreadHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, noticeKind: "success", noticeUnread: true }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );
        const seenHtml = renderToStaticMarkup(
            <ContentTreeNode
                node={{ ...acceptedNode, noticeKind: "success", noticeUnread: false }}
                x={0}
                y={0}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(unreadHtml).toContain("border-color:#4096ff");
        expect(unreadHtml).not.toContain("absolute right-3 top-3 size-2.5");
        expect(unreadHtml).toContain("sr-only\">生成完成，未查看");
        expect(seenHtml).not.toContain("border-color:#4096ff");
    });

    it("uses the standard primary button treatment for optimization", () => {
        const html = renderToStaticMarkup(
            <ConfigProvider theme={getAntThemeConfig(false)}>
                <ContentTreeNode
                    node={acceptedNode}
                    x={0}
                    y={0}
                    selected={false}
                    onSelect={() => undefined}
                    optimizeOpen
                    onOptimize={async () => undefined}
                />
            </ConfigProvider>,
        );

        expect(html).toContain("ant-btn-primary");
        expect(html).toContain("background:#171717");
        expect(html).toContain("color:#ffffff");
    });
});
