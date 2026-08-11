import type {
    ContentNode,
    ContentTopicCitation,
    ContentTopicFactoryCandidate,
    ContentTopicFactoryReview,
} from "@/types/content-production";

export type TopicAngleTransfer = {
    format: "crocotv.topic-angle";
    version: 2;
    candidate: ContentTopicFactoryCandidate;
    citations: ContentTopicCitation[];
    verification: ContentTopicFactoryReview | null;
};

const payoffTypes = new Set(["emotional", "practical", "identity", "financial", "social"]);

export function parseTopicAngleTransfer(text: string): TopicAngleTransfer {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error("文件不是有效的 JSON");
    }
    return normalizeTransfer(value);
}

export function serializeTopicAngleTransfer(value: TopicAngleTransfer) {
    return JSON.stringify(normalizeTransfer(value), null, 2);
}

export function topicAngleCandidatePatch(
    node: ContentNode,
    transfer: TopicAngleTransfer,
): Pick<ContentNode, "title" | "summary" | "data"> {
    const normalized = normalizeTransfer(transfer);
    const topicFactory = objectValue(node.data.topicFactory, "topicFactory");
    return {
        title: normalized.candidate.title,
        summary: normalized.candidate.core_hook,
        data: {
            ...node.data,
            topicFactory: {
                ...topicFactory,
                candidate: normalized.candidate,
                citations: normalized.citations,
            },
        },
    };
}

function normalizeTransfer(value: unknown): TopicAngleTransfer {
    const transfer = objectValue(value, "选题分支");
    if (transfer.format !== "crocotv.topic-angle") throw new Error("format 必须是 crocotv.topic-angle");
    if (transfer.version !== 2) throw new Error("version 必须是 2");
    return {
        format: "crocotv.topic-angle",
        version: 2,
        candidate: normalizeCandidate(transfer.candidate),
        citations: arrayValue(transfer.citations, "citations").map(normalizeCitation),
        verification: transfer.verification == null
            ? null
            : normalizeReview(transfer.verification),
    };
}

function normalizeCitation(value: unknown, index: number): ContentTopicCitation {
    const citation = objectValue(value, `citations[${index}]`);
    const url = requiredString(citation.url, `citations[${index}].url`);
    if (!/^https?:\/\//i.test(url)) throw new Error(`citations[${index}].url 必须是 HTTP(S) URL`);
    return {
        text: requiredString(citation.text, `citations[${index}].text`),
        url,
        ...(typeof citation.title === "string" && citation.title.trim() ? { title: citation.title.trim() } : {}),
        ...(Number.isInteger(citation.start_index) ? { start_index: Number(citation.start_index) } : {}),
        ...(Number.isInteger(citation.end_index) ? { end_index: Number(citation.end_index) } : {}),
    };
}

function normalizeCandidate(value: unknown): ContentTopicFactoryCandidate {
    const candidate = objectValue(value, "candidate");
    const audience = objectValue(candidate.target_audience, "candidate.target_audience");
    const payoff = objectValue(candidate.payoff, "candidate.payoff");
    const payoffType = requiredString(payoff.type, "candidate.payoff.type");
    if (!payoffTypes.has(payoffType)) throw new Error("candidate.payoff.type 无效");
    const tags = arrayValue(candidate.tags, "candidate.tags").map((tag, index) => requiredString(tag, `candidate.tags[${index}]`));
    if (!tags.length) throw new Error("candidate.tags 至少需要一项");
    return {
        title: requiredString(candidate.title, "candidate.title"),
        core_hook: requiredString(candidate.core_hook, "candidate.core_hook"),
        target_audience: {
            segment: requiredString(audience.segment, "candidate.target_audience.segment"),
            need_or_anxiety: requiredString(audience.need_or_anxiety, "candidate.target_audience.need_or_anxiety"),
        },
        specific_situation: requiredString(candidate.specific_situation, "candidate.specific_situation"),
        core_conflict: requiredString(candidate.core_conflict, "candidate.core_conflict"),
        twist_or_gap: requiredString(candidate.twist_or_gap, "candidate.twist_or_gap"),
        payoff: {
            type: payoffType as ContentTopicFactoryCandidate["payoff"]["type"],
            description: requiredString(payoff.description, "candidate.payoff.description"),
        },
        share_motivation: requiredString(candidate.share_motivation, "candidate.share_motivation"),
        story_promise: requiredString(candidate.story_promise, "candidate.story_promise"),
        evidence_requirements: arrayValue(candidate.evidence_requirements, "candidate.evidence_requirements").map((value, index) => {
            const evidence = objectValue(value, `candidate.evidence_requirements[${index}]`);
            const priority = requiredString(evidence.priority, `candidate.evidence_requirements[${index}].priority`);
            if (!["required", "recommended"].includes(priority)) throw new Error(`candidate.evidence_requirements[${index}].priority 无效`);
            return {
                claim: requiredString(evidence.claim, `candidate.evidence_requirements[${index}].claim`),
                evidence_type: requiredString(evidence.evidence_type, `candidate.evidence_requirements[${index}].evidence_type`),
                priority: priority as "required" | "recommended",
            };
        }),
        tags: [...new Set(tags)],
    };
}

function normalizeReview(value: unknown): ContentTopicFactoryReview {
    const review = objectValue(value, "verification");
    const dimensions = objectValue(review.dimension_scores, "verification.dimension_scores");
    const feedback = objectValue(review.feedback_to_gemini, "verification.feedback_to_gemini");
    const verdict = requiredString(review.verdict, "verification.verdict");
    if (!["pass", "revise"].includes(verdict)) throw new Error("verification.verdict 无效");
    return {
        verdict: verdict as ContentTopicFactoryReview["verdict"],
        total_score: integer(review.total_score, "verification.total_score"),
        dimension_scores: {
            audience_relevance: integer(dimensions.audience_relevance, "verification.dimension_scores.audience_relevance"),
            specificity: integer(dimensions.specificity, "verification.dimension_scores.specificity"),
            conflict_or_information_gap: integer(dimensions.conflict_or_information_gap, "verification.dimension_scores.conflict_or_information_gap"),
            payoff: integer(dimensions.payoff, "verification.dimension_scores.payoff"),
            credibility: integer(dimensions.credibility, "verification.dimension_scores.credibility"),
            content_fit: integer(dimensions.content_fit, "verification.dimension_scores.content_fit"),
        },
        blocking_issues: stringArray(review.blocking_issues, "verification.blocking_issues"),
        critical_information: arrayValue(review.critical_information, "verification.critical_information").map((value, index) => {
            const item = objectValue(value, `verification.critical_information[${index}]`);
            return {
                claim: requiredString(item.claim, `verification.critical_information[${index}].claim`),
                covered: booleanValue(item.covered, `verification.critical_information[${index}].covered`),
                citation_indexes: arrayValue(item.citation_indexes, `verification.critical_information[${index}].citation_indexes`).map((value) => integer(value, "citation index")),
                issue: typeof item.issue === "string" ? item.issue : "",
            };
        }),
        feedback_to_gemini: {
            missing_critical_information: stringArray(feedback.missing_critical_information, "verification.feedback_to_gemini.missing_critical_information"),
            revision_instructions: stringArray(feedback.revision_instructions, "verification.feedback_to_gemini.revision_instructions"),
            require_google_search: booleanValue(feedback.require_google_search, "verification.feedback_to_gemini.require_google_search"),
        },
    };
}

function objectValue(value: unknown, label: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
    return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string) {
    if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`);
    return value;
}

function requiredString(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须是非空文本`);
    return value.trim();
}

function stringArray(value: unknown, label: string) {
    return arrayValue(value, label).map((item, index) => requiredString(item, `${label}[${index}]`));
}

function integer(value: unknown, label: string) {
    if (!Number.isInteger(value)) throw new Error(`${label} 必须是整数`);
    return Number(value);
}

function booleanValue(value: unknown, label: string) {
    if (typeof value !== "boolean") throw new Error(`${label} 必须是布尔值`);
    return value;
}
