import { defaultChildType } from "@/lib/content-production/content-workboard";
import { createContentNode, createContentRun, updateContentRun } from "@/services/api/content-production";
import { requestTextGeneration } from "@/services/api/generation-client";
import { decodeChannelModel } from "@/stores/use-config-store";
import type { ContentNode, ContentNodeReference } from "@/types/content-production";

export async function runContentTextExploration(input: {
    topicId: string;
    attemptId: string;
    ownerId: string;
    node: ContentNode;
    references: ContentNodeReference[];
    model: string;
}) {
    const modelId = decodeChannelModel(input.model)?.channelId;
    if (!modelId) throw new Error("请选择一个可用的文本模型");
    const jobIds: string[] = [];
    const run = await createContentRun({
        topicId: input.topicId,
        attemptId: input.attemptId,
        ownerId: input.ownerId,
        rootNodeId: input.node.id,
        resultNodeId: null,
        stage: "storyline_script",
        mode: "manual",
        status: "producer_running",
        round: 1,
        maxRounds: 1,
        producerModelId: modelId,
        reviewerModelId: null,
        fallbackModelId: null,
        currentJobId: null,
        generationJobIds: [],
        outputAssetIds: [],
        policySnapshot: { manual: true },
        promptVersion: null,
        schemaVersion: null,
        inputSnapshot: { nodeId: input.node.id, prompt: input.node.data.prompt, references: input.references },
        output: {},
        reviews: [],
        hardFail: false,
        mediaRetryCount: 0,
        mediaRetryLimit: 0,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
    });
    try {
        const content = await requestTextGeneration({
            model: input.model,
            prompt: String(input.node.data.prompt || input.node.summary || input.node.title),
            inputAssetIds: input.references.flatMap((reference) => reference.assetId ? [reference.assetId] : []),
            onJobCreated: (jobId) => {
                jobIds.push(jobId);
                void updateContentRun(run.id, { currentJobId: jobId, generationJobIds: jobIds });
            },
        });
        const child = await createContentNode({
            topicId: input.topicId,
            attemptId: input.attemptId,
            parentId: input.node.id,
            nodeType: defaultChildType(input.node.nodeType),
            title: `${input.node.title} · 探索结果`,
            summary: content.slice(0, 420),
            sortOrder: 0,
            data: { content, prompt: input.node.data.prompt, model: input.model, runId: run.id, manual: true },
            status: "succeeded",
            createdBy: input.ownerId,
        });
        await updateContentRun(run.id, {
            resultNodeId: child.id,
            status: "accepted",
            output: { content },
            generationJobIds: jobIds,
            currentJobId: null,
            completedAt: new Date().toISOString(),
        });
        return child;
    } catch (error) {
        await updateContentRun(run.id, {
            status: "failed",
            generationJobIds: jobIds,
            currentJobId: null,
            errorMessage: error instanceof Error ? error.message : "文本探索失败",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}
