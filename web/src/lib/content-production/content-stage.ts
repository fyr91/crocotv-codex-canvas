export type TopicModuleStateKind = "failure" | "attention" | "unread" | "running" | "completed" | "idle";

export type TopicModuleState = {
    kind: TopicModuleStateKind;
    label: string;
    priority: number;
};

const moduleStates: Record<TopicModuleStateKind, TopicModuleState> = {
    failure: { kind: "failure", label: "生成失败", priority: 5 },
    attention: { kind: "attention", label: "需要处理", priority: 4 },
    unread: { kind: "unread", label: "有新结果", priority: 3 },
    running: { kind: "running", label: "正在生成", priority: 2 },
    completed: { kind: "completed", label: "已完成", priority: 1 },
    idle: { kind: "idle", label: "暂无运行任务", priority: 0 },
};

export function topicModuleState(input: { failures: number; attention: number; unread: number; running: number; completed: boolean }) {
    if (input.failures > 0) return moduleStates.failure;
    if (input.attention > 0) return moduleStates.attention;
    if (input.unread > 0) return moduleStates.unread;
    if (input.running > 0) return moduleStates.running;
    if (input.completed) return moduleStates.completed;
    return moduleStates.idle;
}

export function parseStructuredOutput<T extends Record<string, unknown>>(value: string, requiredKeys: string[] = []): T {
    const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed: unknown;
    try {
        parsed = JSON.parse(normalized);
    } catch {
        throw new Error("AI 输出不是有效 JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI 输出必须是 JSON Object");
    for (const key of requiredKeys) {
        if (!(key in parsed)) throw new Error(`AI 输出缺少字段：${key}`);
    }
    return parsed as T;
}
