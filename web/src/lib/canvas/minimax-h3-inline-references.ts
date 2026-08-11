export type MiniMaxH3InlineReferenceInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    label?: string;
    text?: string;
};

type MiniMaxH3InlineReferenceResult = {
    prompt: string;
    imageNodeIds: string[];
    audioNodeIds: string[];
};

export function resolveMiniMaxH3InlineReferences(
    prompt: string,
    inputs: MiniMaxH3InlineReferenceInput[],
): MiniMaxH3InlineReferenceResult | { error: string } {
    const inputById = new Map(inputs.map((input) => [input.nodeId, input]));
    const inputByLabel = new Map(inputs.filter((input) => input.label).map((input) => [input.label!, input]));
    const labels = Array.from(inputByLabel.keys()).sort((a, b) => b.length - a.length);
    const imageNodeIds: string[] = [];
    const audioNodeIds: string[] = [];
    const imageIndexById = new Map<string, number>();
    const audioIndexById = new Map<string, number>();
    let error = "";

    const replaceInput = (input: MiniMaxH3InlineReferenceInput | undefined) => {
        if (!input) {
            error ||= "提示词引用的素材已断开，请移除或重新连接";
            return "";
        }
        if (input.type === "text") return input.text || "";
        if (input.type === "video") {
            error ||= "MiniMax H3 多参考暂不支持参考视频";
            return "";
        }
        if (input.type === "image") {
            let index = imageIndexById.get(input.nodeId);
            if (!index) {
                imageNodeIds.push(input.nodeId);
                index = imageNodeIds.length;
                imageIndexById.set(input.nodeId, index);
            }
            return "<Picture " + index + ">";
        }
        let index = audioIndexById.get(input.nodeId);
        if (!index) {
            audioNodeIds.push(input.nodeId);
            index = audioNodeIds.length;
            audioIndexById.set(input.nodeId, index);
        }
        return "<Audio " + index + ">";
    };

    const tokenPattern = new RegExp("@\\[node:([^\\]]+)\\]" + (labels.length ? "|(" + labels.map(escapeRegExp).join("|") + ")" : ""), "g");
    const transformed = prompt.replace(tokenPattern, (_token, nodeId: string | undefined, label: string | undefined) =>
        replaceInput(nodeId ? inputById.get(nodeId) : inputByLabel.get(label || "")));
    if (error) return { error };
    if (imageNodeIds.length > 9) return { error: "MiniMax H3 最多引用 9 张参考图片" };
    if (audioNodeIds.length > 3) return { error: "MiniMax H3 最多引用 3 段参考音频" };
    if (!imageNodeIds.length && !audioNodeIds.length) return { error: "MiniMax H3 多参考至少需要引用一张图片或一段音频" };
    return { prompt: transformed, imageNodeIds, audioNodeIds };
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}
