import type { CreateContentTopicInput } from "@/services/api/content-production";

export function validateInspirationNotes(notes: string) {
    const value = notes.trim();
    if (!value) throw new Error("请说明为什么把这个素材作为灵感");
    return value;
}

export function buildInspirationTopicInput(input: { assetId: string; inspirationId: string; assetTitle: string; notes: string }): CreateContentTopicInput {
    return {
        title: input.assetTitle.trim() || "素材灵感 Topic",
        originalTopic: validateInspirationNotes(input.notes),
        creationNotes: `灵感素材：${input.assetTitle}`,
        tags: [],
        sourceType: "inspiration",
        sourceAssetId: input.assetId,
        sourceInspirationId: input.inspirationId,
        claim: false,
    };
}
