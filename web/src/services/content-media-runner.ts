import { contentMediaStage, ltxMultimodalConfig, mediaNodeTypeForAssetKind } from "@/lib/content-production/content-media";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import {
    createContentArtifact,
    createContentNode,
    createContentRun,
    updateContentRun,
} from "@/services/api/content-production";
import { getCloudAsset, type CloudAsset } from "@/services/api/cloud-assets";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { requestMusicGeneration } from "@/services/api/music";
import { requestVideoGeneration } from "@/services/api/video";
import { requestTextGeneration } from "@/services/api/generation-client";
import { decodeChannelModel, providerIdForModel, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { ContentNode, ContentNodeReference, ContentStagePolicy } from "@/types/content-production";

type RunnerInput = {
    topicId: string;
    attemptId: string;
    ownerId: string;
    node: ContentNode;
    references: ContentNodeReference[];
    policy: ContentStagePolicy;
    config: AiConfig;
};

type GeneratedAsset = {
    id: string;
    kind: "image" | "video" | "audio";
    audioKind?: "speech" | "music";
    url: string;
    title: string;
    mimeType: string;
    bytes: number;
    outputIndex: number;
    durationMs?: number;
    width?: number;
    height?: number;
};

export async function runContentMediaGeneration(input: RunnerInput) {
    const stage = contentMediaStage(input.node.nodeType);
    if (!stage) throw new Error("当前节点不是媒体生成节点");
    const configuredModel = String(input.node.data.model || "");
    const primaryModel = configuredModel || encodedModel(input.policy.producerModelId, input.config.models);
    if (!primaryModel) throw new Error("Super User 尚未配置当前媒体阶段的模型");
    const fallbackModel = encodedModel(input.policy.fallbackModelId, input.config.models);
    const generationJobIds: string[] = [];
    let currentModel = primaryModel;
    let mediaRetryCount = 0;
    let reviews: Array<Record<string, unknown>> = [];

    const run = await createContentRun({
        topicId: input.topicId,
        attemptId: input.attemptId,
        ownerId: input.ownerId,
        rootNodeId: input.node.id,
        resultNodeId: null,
        stage,
        mode: "manual",
        status: "producer_running",
        round: 1,
        maxRounds: 1,
        producerModelId: rawModelId(primaryModel),
        reviewerModelId: input.policy.reviewerModelId,
        fallbackModelId: input.policy.fallbackModelId,
        currentJobId: null,
        generationJobIds,
        outputAssetIds: [],
        policySnapshot: input.policy as unknown as Record<string, unknown>,
        promptVersion: input.policy.promptVersion,
        schemaVersion: input.policy.schemaVersion,
        inputSnapshot: { nodeId: input.node.id, nodeData: input.node.data, references: input.references },
        output: {},
        reviews: [],
        hardFail: false,
        mediaRetryCount: 0,
        mediaRetryLimit: input.policy.mediaRetryLimit,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
    });

    const referenceAssets = await Promise.all(input.references.flatMap((reference) => reference.assetId ? [getCloudAsset(reference.assetId)] : []));
    try {
        let generated: GeneratedAsset[] | null = null;
        while (!generated) {
            try {
                const candidate = await generateMedia(input, currentModel, referenceAssets, (jobId) => {
                    generationJobIds.push(jobId);
                    void updateContentRun(run.id, { currentJobId: jobId, generationJobIds });
                });
                reviews = await reviewMedia(input, candidate, generationJobIds, run.id);
                const hardFailure = reviews.find((review) => review.hard_fail === true || String(review.verdict || "").toLowerCase() === "reject");
                if (hardFailure) {
                    await recordRejectedMedia(input, run.id, candidate, currentModel, reviews);
                    throw new Error(String(hardFailure.summary || "媒体硬失败检查未通过"));
                }
                generated = candidate;
            } catch (error) {
                if (mediaRetryCount >= input.policy.mediaRetryLimit) throw error;
                mediaRetryCount += 1;
                if (fallbackModel) currentModel = fallbackModel;
                await updateContentRun(run.id, { status: "repairing", mediaRetryCount, producerModelId: rawModelId(currentModel), reviews, hardFail: reviews.some((review) => review.hard_fail === true), errorMessage: error instanceof Error ? error.message : "媒体生成失败" });
            }
        }

        const artifactIds: string[] = [];
        let firstNodeId: string | null = null;
        let resultParentId = input.node.id;
        if (generated.length > 1) {
            const batchNode = await createContentNode({
                topicId: input.topicId,
                attemptId: input.attemptId,
                parentId: input.node.id,
                nodeType: "batch",
                title: `生成批次 · ${generated.length} 个结果`,
                summary: `成功 ${generated.length} · 失败 0 · 可展开选择后继续探索`,
                sortOrder: Number(input.node.data.batchCount || 0),
                data: { count: generated.length, succeeded: generated.length, failed: 0, runId: run.id, model: currentModel },
                status: "succeeded",
                createdBy: input.ownerId,
            });
            resultParentId = batchNode.id;
            firstNodeId = batchNode.id;
        }
        for (const asset of generated) {
            const resultNode = await createContentNode({
                topicId: input.topicId,
                attemptId: input.attemptId,
                parentId: resultParentId,
                nodeType: mediaNodeTypeForAssetKind(asset.kind, asset.audioKind),
                title: `${asset.title} ${asset.outputIndex + 1}`,
                summary: asset.kind === "video" ? "AI 多模态生成 Clip" : asset.kind === "image" ? "生成分镜图" : asset.audioKind === "music" ? "生成音乐" : "生成角色语音",
                sortOrder: asset.outputIndex,
                data: {
                    assetId: asset.id,
                    url: asset.url,
                    mimeType: asset.mimeType,
                    durationMs: asset.durationMs,
                    width: asset.width,
                    height: asset.height,
                    model: currentModel,
                    runId: run.id,
                    ...(asset.kind === "audio" && asset.audioKind !== "music" ? { sourceType: "generated" } : {}),
                },
                status: "succeeded",
                createdBy: input.ownerId,
            });
            firstNodeId ||= resultNode.id;
            const artifact = await createContentArtifact({
                topicId: input.topicId,
                attemptId: input.attemptId,
                nodeId: resultNode.id,
                runId: run.id,
                assetId: asset.id,
                ownerId: input.ownerId,
                kind: asset.kind,
                source: "ai",
                outputIndex: asset.outputIndex,
                metadata: { mimeType: asset.mimeType, bytes: asset.bytes, durationMs: asset.durationMs, width: asset.width, height: asset.height, model: currentModel },
            });
            artifactIds.push(artifact.id);
        }
        await updateContentRun(run.id, {
            resultNodeId: firstNodeId,
            outputAssetIds: generated.map((asset) => asset.id),
            output: { artifactIds, count: generated.length },
            reviews,
            generationJobIds,
            currentJobId: null,
            status: "accepted",
            mediaRetryCount,
            completedAt: new Date().toISOString(),
            errorMessage: null,
        });
        return { runId: run.id, artifactIds, count: generated.length };
    } catch (error) {
        await updateContentRun(run.id, {
            status: "failed",
            hardFail: true,
            generationJobIds,
            currentJobId: null,
            mediaRetryCount,
            errorMessage: error instanceof Error ? error.message : "媒体生成失败",
            completedAt: new Date().toISOString(),
        });
        throw error;
    }
}

async function recordRejectedMedia(input: RunnerInput, runId: string, assets: GeneratedAsset[], model: string, reviews: Array<Record<string, unknown>>) {
    await Promise.all(assets.map((asset) => createContentArtifact({
        topicId: input.topicId,
        attemptId: input.attemptId,
        nodeId: input.node.id,
        runId,
        assetId: asset.id,
        ownerId: input.ownerId,
        kind: asset.kind,
        source: "ai",
        outputIndex: asset.outputIndex,
        metadata: { rejected: true, reviews: reviews.filter((review) => review.assetId === asset.id), mimeType: asset.mimeType, model },
    })));
}

async function reviewMedia(input: RunnerInput, generated: GeneratedAsset[], generationJobIds: string[], runId: string) {
    if (!input.policy.validationEnabled || !["image", "video"].includes(input.policy.capability)) return [];
    const reviewer = encodedModel(input.policy.reviewerModelId, input.config.models);
    if (!reviewer) throw new Error("Super User 尚未配置媒体检查模型");
    const reviews: Array<Record<string, unknown>> = [];
    await updateContentRun(runId, { status: "reviewer_running" });
    for (const asset of generated) {
        const text = await requestTextGeneration({
            model: reviewer,
            inputAssetIds: [asset.id],
            prompt: [
                `你是${asset.kind === "video" ? "视频" : "图片"}硬失败检查 Agent。只识别阻断交付的技术或明显语义问题，不对主观创意风格打分。`,
                asset.kind === "video"
                    ? "检查能否播放、黑帧/空帧、严重闪烁或破碎、主体明显畸变、音画完全异常、与生成指令明显无关。"
                    : "检查空白图、严重破碎、主体明显畸变、关键主体缺失、与分镜指令明显无关。",
                `原始生成指令：${String(input.node.data.prompt || input.node.summary || input.node.title)}`,
                '只输出 JSON：{"verdict":"accept|reject","hard_fail":false,"summary":"","issues":[]}',
            ].join("\n"),
            params: { responseFormat: { type: "json_object" } },
            onJobCreated: (jobId) => {
                generationJobIds.push(jobId);
                void updateContentRun(runId, { currentJobId: jobId, generationJobIds });
            },
        });
        reviews.push({ ...parseJsonObject(text), assetId: asset.id });
    }
    return reviews;
}

function parseJsonObject(value: string) {
    const parsed = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("媒体检查模型没有返回 JSON 对象");
    return parsed as Record<string, unknown>;
}

async function generateMedia(input: RunnerInput, model: string, assets: CloudAsset[], onJobCreated: (jobId: string) => void): Promise<GeneratedAsset[]> {
    const count = Math.max(1, Math.min(8, Number(input.node.data.count || 1)));
    const baseConfig = {
        ...input.config,
        model,
        imageModel: model,
        videoModel: model,
        speechModel: model,
        musicModel: model,
        count: String(Math.min(3, count)),
        videoCount: String(count),
        videoSeconds: String(input.node.data.duration || input.config.videoSeconds || "6"),
        audioVoice: String(input.node.data.voice || input.config.audioVoice || ""),
    };
    const prompt = String(input.node.data.prompt || input.node.summary || input.node.title).trim();
    const images = assets.filter((asset) => asset.kind === "image" && asset.url).map(referenceImage);
    const videos = assets.filter((asset) => asset.kind === "video" && asset.url).map(referenceVideo);
    const audios = assets.filter((asset) => asset.kind === "audio" && asset.url).map(referenceAudio);

    if (input.node.nodeType === "image" || input.node.nodeType === "storyboard_prompt") {
        const results = images.length
            ? await requestEdit(baseConfig, prompt, images, undefined, { onJobCreated })
            : await requestGeneration(baseConfig, prompt, { onJobCreated });
        return results.map((item, outputIndex) => ({ id: item.storageKey, kind: "image", url: item.dataUrl, title: input.node.title, mimeType: "image/png", bytes: 0, outputIndex }));
    }
    if (input.node.nodeType === "tts") {
        if (!baseConfig.audioVoice) throw new Error("请先为角色语音选择固定 Voice");
        const blob = await requestAudioGeneration(baseConfig, prompt, { onJobCreated });
        const stored = await storeGeneratedAudio(blob, baseConfig.audioFormat);
        return [{ id: stored.storageKey, kind: "audio", audioKind: "speech", url: stored.url, title: input.node.title, mimeType: stored.mimeType, bytes: stored.bytes, durationMs: stored.durationMs, outputIndex: 0 }];
    }
    if (input.node.nodeType === "music") {
        const results = await requestMusicGeneration(baseConfig, {
            title: String(input.node.data.title || input.node.title),
            description: String(input.node.data.description || prompt),
            lyrics: String(input.node.data.lyrics || ""),
            instrumental: input.node.data.instrumental !== false,
            styles: Array.isArray(input.node.data.styles) ? input.node.data.styles as string[] : [],
            negativeTags: String(input.node.data.negativeTags || ""),
            vocalGender: input.node.data.vocalGender === "m" || input.node.data.vocalGender === "f" ? input.node.data.vocalGender : undefined,
            styleWeight: Number(input.node.data.styleWeight ?? 0.65),
            weirdnessConstraint: Number(input.node.data.weirdnessConstraint ?? 0.65),
        }, { onJobCreated });
        return results.map((item, outputIndex) => ({ id: item.storageKey, kind: "audio", audioKind: "music", url: item.url, title: item.title, mimeType: item.mimeType, bytes: item.bytes, durationMs: item.durationMs, outputIndex }));
    }
    if (input.node.nodeType === "video") {
        const videoConfig = providerIdForModel(model) === "ltx" ? ltxMultimodalConfig(baseConfig) : baseConfig;
        const results = await requestVideoGeneration(videoConfig, prompt, images, videos, audios, { onJobCreated });
        return results.map((item, outputIndex) => {
            if (!item.storageKey || !item.url) throw new Error("视频结果缺少可登记的素材");
            return { id: item.storageKey, kind: "video" as const, url: item.url, title: input.node.title, mimeType: item.mimeType || "video/mp4", bytes: item.bytes || 0, durationMs: item.durationMs, width: item.width, height: item.height, outputIndex };
        });
    }
    throw new Error("不支持的媒体节点类型");
}

function encodedModel(id: string | null, models: string[]) {
    if (!id) return "";
    return models.find((model) => model.startsWith(`${id}::`)) || "";
}

function rawModelId(model: string) {
    return decodeChannelModel(model)?.channelId || null;
}

function referenceImage(asset: CloudAsset): ReferenceImage {
    return { id: asset.id, name: asset.title, type: asset.mime_type || "image/png", dataUrl: asset.url || "", url: asset.url, storageKey: asset.id };
}

function referenceVideo(asset: CloudAsset): ReferenceVideo {
    return { id: asset.id, name: asset.title, type: asset.mime_type || "video/mp4", url: asset.url || "", storageKey: asset.id, bytes: asset.byte_size || undefined, width: asset.width || undefined, height: asset.height || undefined, durationMs: asset.duration_seconds ? asset.duration_seconds * 1000 : undefined };
}

function referenceAudio(asset: CloudAsset): ReferenceAudio {
    return { id: asset.id, name: asset.title, type: asset.mime_type || "audio/mpeg", url: asset.url || "", storageKey: asset.id, durationMs: asset.duration_seconds ? asset.duration_seconds * 1000 : undefined };
}
