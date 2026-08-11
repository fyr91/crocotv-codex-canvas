export type CourseScriptPromptInput = {
    topic: string;
    audience: string;
    extraPrompt: string;
};

export function courseScriptPrompt({ topic, audience, extraPrompt }: CourseScriptPromptInput) {
    return [
        `课程主题：${topic.trim()}`,
        `目标受众：${audience.trim()}`,
        extraPrompt.trim() ? `额外提示词：${extraPrompt.trim()}` : "",
    ].filter(Boolean).join("\n");
}

export function courseScriptGroupOptimizationPrompt(sourceInput: string, direction: string) {
    return `${sourceInput.trim()}\n\n整组优化要求：\n${direction.trim()}`;
}
