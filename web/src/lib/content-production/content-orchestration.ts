export function composeContentPrompt(input: { systemPrompt: string; schema: Record<string, unknown>; input: Record<string, unknown> }) {
    return [
        input.systemPrompt.trim(),
        "以下是本次 Topic、当前 Attempt 的 Orientation、祖先节点与显式引用等运行时变量：",
        JSON.stringify(input.input),
        "严格只输出满足以下 JSON Schema 的 JSON 对象，不要输出 Markdown 代码块或额外解释：",
        JSON.stringify(input.schema),
    ].join("\n\n");
}

export function contentReviewAccepted(review: Record<string, unknown>, rule: Record<string, unknown>) {
    const verdict = String(review.verdict || "").toLowerCase();
    if (!["accept", "accepted", "pass", "approved"].includes(verdict)) return false;
    if (rule.blockingIssuesMustBeEmpty === true) {
        const blockers = Array.isArray(review.blocking_issues) ? review.blocking_issues : [];
        if (blockers.length) return false;
    }
    if (typeof rule.minimumScore === "number" && Number(review.score || 0) < rule.minimumScore) return false;
    return true;
}

export function nextOrchestrationAction(input: { accepted: boolean; round: number; maxRounds: number }) {
    if (input.accepted) return "accept" as const;
    if (input.round < input.maxRounds) return "repair" as const;
    return "owner_attention" as const;
}
