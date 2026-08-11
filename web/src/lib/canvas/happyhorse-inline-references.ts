export type HappyHorseInlineReferenceInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    label?: string;
    text?: string;
};

type HappyHorseInlineReferenceResult = {
    prompt: string;
    imageNodeIds: string[];
};

export function resolveHappyHorseInlineReferences(
    prompt: string,
    inputs: HappyHorseInlineReferenceInput[],
    maxImages: number,
): HappyHorseInlineReferenceResult | { error: string } {
    const inputById = new Map(inputs.map((input) => [input.nodeId, input]));
    const imageNodeIds: string[] = [];
    const imageIndexById = new Map<string, number>();
    let error = "";
    const replaceInput = (input: HappyHorseInlineReferenceInput | undefined) => {
        if (!input) {
            error ||= "提示词引用的素材已断开，请移除或重新连接";
            return "";
        }
        if (input.type === "text") return input.text || "";
        if (input.type !== "image") {
            error ||= "当前模式的提示词只支持引用文字和图片";
            return "";
        }
        let index = imageIndexById.get(input.nodeId);
        if (!index) {
            imageNodeIds.push(input.nodeId);
            index = imageNodeIds.length;
            imageIndexById.set(input.nodeId, index);
        }
        return `[Image ${index}]`;
    };
    const inputByLabel = new Map(inputs.filter((input) => input.label).map((input) => [input.label!, input]));
    const labels = Array.from(inputByLabel.keys()).sort((a, b) => b.length - a.length);
    const tokenPattern = new RegExp(`@\\[node:([^\\]]+)\\]${labels.length ? `|(${labels.map(escapeRegExp).join("|")})` : ""}`, "g");
    const transformed = prompt.replace(tokenPattern, (_token, nodeId: string | undefined, label: string | undefined) => replaceInput(nodeId ? inputById.get(nodeId) : inputByLabel.get(label || "")));
    if (error) return { error };
    if (imageNodeIds.length > maxImages) return { error: `最多引用 ${maxImages} 张参考图` };
    return { prompt: transformed, imageNodeIds };
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
