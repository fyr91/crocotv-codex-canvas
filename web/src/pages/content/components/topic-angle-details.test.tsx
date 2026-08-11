import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopicAngleDetails } from "./topic-angle-details";
import type { ContentNode, ContentTopicFactorySnapshot } from "@/types/content-production";

const node: ContentNode = {
    id: "angle-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "root-1",
    nodeType: "angle",
    title: "别再追求完美计划",
    summary: "计划越精细，越可能拖延行动",
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
            reviewCycle: 2,
            runId: "run-1",
            latestGeminiInteractionId: "interaction-2",
            candidate: {
                title: "别再追求完美计划",
                core_hook: "计划越精细，越可能拖延行动",
                target_audience: { segment: "年轻职场人", need_or_anxiety: "害怕开始" },
                specific_situation: "周日晚上制定下周计划",
                core_conflict: "控制感与行动力冲突",
                twist_or_gap: "计划本身成为逃避",
                payoff: { type: "practical", description: "得到三步启动法" },
                share_motivation: "转发给总在做计划的朋友",
                story_promise: "看完能立即开始第一步",
                evidence_requirements: [{ claim: "过度计划会拖延", evidence_type: "研究", priority: "required" }],
                tags: ["职场", "拖延"],
            },
            citations: [
                { text: "完整事实 A：儿童中暑补液需要关注电解质，并持续观察症状变化。", url: "https://example.com/a" },
                { text: "完整事实 A：儿童中暑补液需要关注电解质，并持续观察症状变化。", url: "https://example.com/a" },
                { text: "完整事实 A：儿童中暑补液需要关注电解质，并持续观察症状变化。", url: "https://example.com/b" },
                { text: "这是一段需要完整换行展示、不能截断或摘要的长 Grounding 文本。\n第二行也必须保留。", title: "baidu.com", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/sample-token-with-a-very-long-path" },
            ],
            review: {
                verdict: "pass",
                total_score: 88,
                dimension_scores: {
                    audience_relevance: 15,
                    specificity: 15,
                    conflict_or_information_gap: 15,
                    payoff: 15,
                    credibility: 14,
                    content_fit: 14,
                },
                blocking_issues: [],
                critical_information: [],
                feedback_to_gemini: {
                    missing_critical_information: [],
                    revision_instructions: [],
                    require_google_search: false,
                },
            },
            score: 88,
            warning: null,
            error: null,
        },
    },
};

describe("TopicAngleDetails", () => {
    it("renders citation titles or hostnames without Grounding text in editable and read-only panels", () => {
        for (const editable of [true, false]) {
            const html = renderToStaticMarkup(<TopicAngleDetails
                node={node}
                jobs={[]}
                editable={editable}
                generating={false}
                onSave={async () => node}
                onContinue={async () => undefined}
            />);

            expect(html).not.toContain("完整事实 A：儿童中暑补液需要关注电解质，并持续观察症状变化。");
            expect(html.match(/href="https:\/\/example\.com\/a"/g)).toHaveLength(2);
            expect(html).toContain('href="https://example.com/b"');
            expect(html).toContain(">example.com</a>");
            expect(html).toContain(">baidu.com</a>");
            expect(html).not.toContain(">https://example.com/a</a>");
            expect(html).not.toContain(">https://vertexaisearch.cloud.google.com/");
            expect(html).not.toContain("第二行也必须保留。");
            expect(html).not.toContain("whitespace-pre-wrap break-words");
            expect(html).toContain("break-all");
            expect(html).not.toContain("line-clamp");
        }
    });

    it("renders the structured candidate and unlocks only an accepted branch", () => {
        const html = renderToStaticMarkup(<TopicAngleDetails
            node={node}
            jobs={[]}
            editable
            generating={false}
            onSave={async () => node}
            onContinue={async () => undefined}
        />);

        expect(html).toContain("别再追求完美计划");
        expect(html).toContain("88");
        expect(html).toContain("基于此选题生成故事线");
        expect(html).toContain("下载 JSON");
        expect(html).toContain("导入 JSON");
        expect(html).not.toContain("保存选题");
        expect(html).toContain("来源");
        expect(html).toContain("https://example.com/a");
        expect(html).not.toContain('value="https://example.com/a"');
        expect((html.match(/<textarea/g) || []).length).toBeGreaterThanOrEqual(10);
        expect(html).not.toContain("证据要求与来源");
        expect(html).not.toContain("差异化");
        expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*基于此选题生成故事线/);
    });

    it("keeps an unapproved terminal candidate editable and available for storyline generation", () => {
        const html = renderToStaticMarkup(<TopicAngleDetails
            node={{
                ...node,
                status: "succeeded",
                data: {
                    topicFactory: {
                        ...node.data.topicFactory!,
                        phase: "ready_warning",
                        warning: "仍有质量提示",
                        review: {
                            ...(node.data.topicFactory as ContentTopicFactorySnapshot).review!,
                            verdict: "revise",
                            total_score: 72,
                            blocking_issues: ["需要强化信息差"],
                        },
                    },
                },
            }}
            jobs={[]}
            editable
            generating={false}
            onSave={async () => node}
            onContinue={async () => undefined}
        />);

        expect(html).toContain("基于此选题生成故事线");
        expect(html).not.toContain("通过验证后可继续");
        expect((html.match(/<textarea/g) || []).length).toBeGreaterThanOrEqual(10);
        expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*基于此选题生成故事线/);
    });

    it("separates the reasoning card from the core content", () => {
        const html = renderToStaticMarkup(<TopicAngleDetails
            node={{
                ...node,
                status: "running",
                data: {
                    topicFactory: {
                        ...node.data.topicFactory!,
                        phase: "humanizing",
                    },
                },
            }}
            jobs={[{ id: "humanizer-1", status: "running", reasoning_text: "正在调整语言节奏" }]}
            editable
            generating={false}
            onSave={async () => node}
            onContinue={async () => undefined}
        />);

        expect(html).toContain("去 AI 化中");
        expect(html).toContain('class="mb-5"');
        expect(html).toContain("核心爆点");
    });

    it("leaves the result area empty until real thinking or structured output exists", () => {
        const html = renderToStaticMarkup(<TopicAngleDetails
            node={{
                ...node,
                status: "running",
                data: {
                    topicFactory: {
                        ...node.data.topicFactory!,
                        phase: "generating",
                        candidate: null,
                        review: null,
                    },
                },
            }}
            jobs={[]}
            editable
            generating
            onSave={async () => node}
            onContinue={async () => undefined}
        />);

        expect(html).not.toContain("Gemini 正在生成当前选题的结构化内容");
        expect(html).not.toContain("ant-alert-info");
        expect(html).not.toContain("生成与验证记录（0）");
        expect(html).toContain("基于此选题生成故事线");
        expect(html).toMatch(/<button[^>]*disabled[^>]*>.*基于此选题生成故事线/s);
    });
});
