import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentNode, ContentStorylineCandidate } from "@/types/content-production";
import { StorylineDetails } from "./storyline-details";

const candidate: ContentStorylineCandidate = {
    format: "crocotv.storyline",
    version: 2,
    positioning: {
        core_narrative_anchor: "同一杯咖啡因为杯色产生相反判断。",
        emotional_value: "拆穿误区",
        emotional_curve: ["好奇", "紧张", "震惊", "爽快"],
        opening_visual_beats: [
            { order: 1, visual_concept: "顾客吞下一勺咖啡粉后皱眉。", narrative_function: "抛出苦味误区。" },
            { order: 2, visual_concept: "同壶咖啡倒进黑杯与透明杯。", narrative_function: "制造视觉反差。" },
        ],
    },
    five_act: {
        setup: { conflict: "顾客坚持越苦越提神。", character_action: "店员摆出同壶咖啡。", suspense: "判断为何相反？" },
        escalation: {
            layers: [
                { order: 1, pressure: "顾客第一次判断错误。", character_action: "店员交换杯位。", consequence: "判断再次反转。" },
                { order: 2, pressure: "围观者质疑换咖啡。", character_action: "店员同步倒入两杯。", consequence: "众人仍给出相反答案。" },
            ],
            loss_of_control_point: "现场争论哪杯咖啡因更高。",
        },
        reveal: { truth_or_solution: "两杯咖啡因相同。", unexpected_but_inevitable: "始终来自同一壶。", anchor_connection: "杯色改变苦味预期。" },
        payoff: { direct_result: "顾客不再看苦味判断。", emotional_release: "众人恍然大悟。", audience_value: "学会查看豆种与萃取量。" },
        cta_bridge: { transition: "还有哪些咖啡常识是错的？", target_action: "评论并保存", motivation: "下一期继续双盲验证。" },
    },
};

const node: ContentNode = {
    id: "story-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "angle-1",
    nodeType: "storyline",
    title: "咖啡错觉",
    summary: candidate.positioning.core_narrative_anchor,
    sortOrder: 0,
    data: {
        storylineWorkflow: {
            operation: "generate",
            phase: "accepted",
            round: 1,
            runId: "run-1",
            sourceNodeId: "angle-1",
            upstreamAngleNodeId: "angle-1",
            parentInteractionId: "topic-interaction",
            latestGeminiInteractionId: "story-interaction",
            optimizationDirection: null,
            candidate,
            review: {
                verdict: "pass",
                total_score: 91,
                core_assessment: "爆点聚焦，反转可信。",
                dimension_scores: {
                    opening_hook: { score: 18, strengths: [], issues: [], deduction_reasons: [] },
                    narrative_tension: { score: 23, strengths: [], issues: [], deduction_reasons: [] },
                    emotional_payoff: { score: 18, strengths: [], issues: [], deduction_reasons: [] },
                    cta_naturalness: { score: 14, strengths: [], issues: [], deduction_reasons: [] },
                    executability: { score: 18, strengths: [], issues: [], deduction_reasons: [] },
                },
                blocking_issues: [],
                revision_instructions: [],
                restructured_storyline: null,
            },
            lastError: null,
        },
    },
    status: "succeeded",
    revision: 1,
    createdBy: "owner-1",
    hiddenAt: null,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
};

describe("StorylineDetails", () => {
    it("renders the editable V2 structure, review, and downstream action", () => {
        const html = renderToStaticMarkup(
            <StorylineDetails
                node={node}
                jobs={[]}
                editable
                generating={false}
                onSave={async () => node}
                onContinue={async () => undefined}
            />,
        );

        expect(html).toContain("故事线 V2");
        expect(html).toContain("前三秒视觉节拍");
        expect(html).toContain("Setup（起）");
        expect(html).toContain("Escalation（承）");
        expect(html).toContain("CTA_Bridge（引导）");
        expect(html).toContain("GLM 审核");
        expect(html).toContain("91");
        expect(html).toContain("生成镜头");
    });
});
