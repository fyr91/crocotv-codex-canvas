export type CanvasPromptEditorToken =
    | { type: "text"; value: string }
    | { type: "reference"; key: string };

export function shouldRenderCanvasPromptValue(focused: boolean, composing: boolean, currentValue: string, nextValue: string) {
    if (focused && composing) return false;
    return !focused || currentValue !== nextValue;
}

export function isCanvasPromptValueAllowed(value: string, maxLength?: number) {
    return typeof maxLength !== "number" || value.length <= maxLength;
}

export function appendCanvasPromptBlock(currentValue: string, blockValue: string, placeholderBreak: boolean, hasPreviousNode = Boolean(currentValue)) {
    return `${currentValue}${hasPreviousNode ? "\n" : ""}${placeholderBreak ? "" : blockValue}`;
}

export function parseCanvasPromptReferenceTokens(value: string, references: { key: string; label: string }[], highlightLabels: boolean): CanvasPromptEditorToken[] {
    if (!value || !references.length) return value ? [{ type: "text", value }] : [];
    const referenceByKey = new Map(references.map((reference) => [reference.key, reference]));
    const referenceByLabel = new Map(references.map((reference) => [reference.label, reference]));
    const labels = highlightLabels ? references.map((reference) => escapeRegExp(reference.label)).sort((a, b) => b.length - a.length) : [];
    const pattern = new RegExp(`@\\[node:([^\\]]+)\\]${labels.length ? `|(${labels.join("|")})` : ""}`, "g");
    const tokens: CanvasPromptEditorToken[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        const reference = match[1] ? referenceByKey.get(match[1]) : referenceByLabel.get(match[2] || "");
        if (reference) tokens.push({ type: "reference", key: reference.key });
        else tokens.push({ type: "text", value: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
