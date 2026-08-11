import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    abandonContentTopic,
    activateContentModelPromptVersion,
    claimContentTopic,
    completeContentTopic,
    createContentNode,
    createContentReference,
    createContentDelivery,
    createContentTopic,
    createContentWorkflowProject,
    deleteContentWorkflowProject,
    getContentGlobalSettings,
    getContentProductionStats,
    getContentTopic,
    deleteContentReference,
    deselectContentClip,
    listContentArtifacts,
    listContentActivityEvents,
    listContentClipSelections,
    listContentCompletions,
    listContentDeliveries,
    listContentNodes,
    listContentNoticeNodes,
    listContentMembers,
    listContentModelPromptVersions,
    listOwnerContentRuns,
    listContentReferences,
    listContentRuns,
    listContentStagePolicies,
    listContentTopics,
    listContentWorkflowProjects,
    getContentWorkflowProject,
    listGenerationJobsByIds,
    markContentNodeNoticeSeen,
    optimizeContentTopicFactory,
    regenerateContentTopicFactory,
    saveContentModelPromptVersion,
    selectContentClip,
    startContentTopicFactory,
    startContentStorylineOperation,
    startContentStoryboardOperation,
    stopContentStoryboard,
    stopContentTopicFactory,
    subscribeContentProduction,
    updateContentNode,
    updateContentStagePolicy,
    type CreateContentTopicInput,
} from "@/services/api/content-production";
import type { GenerationJob } from "@/services/api/generation-client";
import { mergeGenerationJobUpdate, watchGenerationJobs } from "@/services/api/generation-job-watch";
import type { ContentNode } from "@/types/content-production";
import { listKouboNotices, saveCourseScriptModel } from "@/services/api/koubo-video";

export const contentQueryKeys = {
    settings: ["content-production", "settings"] as const,
    topics: ["content-production", "topics"] as const,
    projects: ["content-production", "projects"] as const,
    project: (projectId: string) => ["content-production", "project", projectId] as const,
    topic: (topicId: string) => ["content-production", "topic", topicId] as const,
    nodes: (attemptId: string) => ["content-production", "nodes", attemptId] as const,
    references: (attemptId: string) => ["content-production", "references", attemptId] as const,
    runs: (attemptId: string) => ["content-production", "runs", attemptId] as const,
    jobs: (attemptId: string, ids: string[]) => ["content-production", "jobs", attemptId, [...ids].sort().join(",")] as const,
    artifacts: (attemptId: string) => ["content-production", "artifacts", attemptId] as const,
    selections: (attemptId: string) => ["content-production", "selections", attemptId] as const,
    deliveries: (attemptId: string) => ["content-production", "deliveries", attemptId] as const,
    completions: (topicId: string) => ["content-production", "completions", topicId] as const,
    policies: ["content-production", "policies"] as const,
    modelPrompts: (stage: string) => ["content-production", "model-prompts", stage] as const,
    stats: (start: string, end: string, memberId?: string) => ["content-production", "stats", start, end, memberId || "all"] as const,
    members: ["content-production", "members"] as const,
    activity: (topicId?: string) => ["content-production", "activity", topicId || "all"] as const,
    ownerRuns: (ownerId: string) => ["content-production", "owner-runs", ownerId] as const,
    noticeNodes: (ownerId: string) => ["content-production", "notice-nodes", ownerId] as const,
    kouboNotices: (ownerId: string) => ["content-production", "koubo-notices", ownerId] as const,
};

type ChangeRow = Record<string, unknown>;
type RealtimePayload = { new?: ChangeRow; old?: ChangeRow };

export function contentInvalidationKeys(table: string, payload: RealtimePayload) {
    const row = payload.new || payload.old || {};
    if (table === "content_topics") {
        return [contentQueryKeys.topics, ...(row.id ? [contentQueryKeys.topic(String(row.id))] : [])];
    }
    if (table === "content_nodes") {
        return [
            ...(row.attempt_id ? [contentQueryKeys.nodes(String(row.attempt_id))] : []),
            ...(row.topic_id ? [contentQueryKeys.topic(String(row.topic_id))] : []),
            ...(row.created_by ? [contentQueryKeys.noticeNodes(String(row.created_by))] : []),
        ];
    }
    if (table === "content_generation_runs") {
        return [
            ...(row.attempt_id ? [contentQueryKeys.runs(String(row.attempt_id))] : []),
            ...(row.topic_id ? [contentQueryKeys.topic(String(row.topic_id))] : []),
            ...(row.owner_id ? [contentQueryKeys.ownerRuns(String(row.owner_id))] : []),
            contentQueryKeys.topics,
        ];
    }
    if (table === "koubo_projects") {
        return [
            ...(row.owner_id ? [contentQueryKeys.kouboNotices(String(row.owner_id))] : []),
            ...(row.project_id ? [["koubo-workspace", String(row.project_id)] as const] : []),
            contentQueryKeys.projects,
        ];
    }
    return [];
}

export function useContentProductionRealtime(enabled = true) {
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!enabled) return;
        return subscribeContentProduction((table, payload) => {
            for (const key of contentInvalidationKeys(table, payload as RealtimePayload)) {
                void queryClient.invalidateQueries({ queryKey: key });
            }
        });
    }, [enabled, queryClient]);
}

export function useContentGlobalSettingsQuery() {
    return useQuery({ queryKey: contentQueryKeys.settings, queryFn: getContentGlobalSettings, staleTime: 60_000 });
}

export function useContentTopicsQuery(filters: Parameters<typeof listContentTopics>[0] = {}) {
    return useQuery({ queryKey: [...contentQueryKeys.topics, filters], queryFn: () => listContentTopics(filters) });
}

export function useContentWorkflowProjectsQuery() {
    return useQuery({ queryKey: contentQueryKeys.projects, queryFn: listContentWorkflowProjects });
}

export function useContentWorkflowProjectQuery(projectId: string, enabled = true) {
    return useQuery({ queryKey: contentQueryKeys.project(projectId), queryFn: () => getContentWorkflowProject(projectId), enabled: Boolean(projectId) && enabled, retry: false });
}

export function useCreateContentWorkflowProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => createContentWorkflowProject("koubo-video"),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.projects }),
    });
}

export function useDeleteContentWorkflowProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteContentWorkflowProject,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.projects }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.topics }),
            ]);
        },
    });
}

export function useContentTopicQuery(topicId: string) {
    return useQuery({ queryKey: contentQueryKeys.topic(topicId), queryFn: () => getContentTopic(topicId), enabled: Boolean(topicId) });
}

export function useContentWorkboardQuery(attemptId: string) {
    const enabled = Boolean(attemptId);
    return {
        nodes: useQuery({ queryKey: contentQueryKeys.nodes(attemptId), queryFn: () => listContentNodes(attemptId), enabled }),
        references: useQuery({ queryKey: contentQueryKeys.references(attemptId), queryFn: () => listContentReferences(attemptId), enabled }),
        runs: useQuery({ queryKey: contentQueryKeys.runs(attemptId), queryFn: () => listContentRuns(attemptId), enabled, refetchInterval: (query) => query.state.data?.some((run) => ["queued", "producer_running", "reviewer_running", "repairing", "humanizing"].includes(run.status)) ? 2500 : false }),
        artifacts: useQuery({ queryKey: contentQueryKeys.artifacts(attemptId), queryFn: () => listContentArtifacts(attemptId), enabled }),
        selections: useQuery({ queryKey: contentQueryKeys.selections(attemptId), queryFn: () => listContentClipSelections(attemptId), enabled }),
        deliveries: useQuery({ queryKey: contentQueryKeys.deliveries(attemptId), queryFn: () => listContentDeliveries(attemptId), enabled }),
    };
}

export function useContentGenerationJobsQuery(attemptId: string, ids: string[]) {
    const queryClient = useQueryClient();
    const stableIds = [...new Set(ids)].filter(Boolean).sort();
    const idsSignature = stableIds.join(",");
    const enabled = Boolean(attemptId && stableIds.length);
    useEffect(() => {
        if (!enabled) return;
        const subscribedIds = idsSignature.split(",");
        const allowedIds = new Set(subscribedIds);
        const queryKey = contentQueryKeys.jobs(attemptId, subscribedIds);
        return watchGenerationJobs(subscribedIds, (job) => {
            queryClient.setQueryData<GenerationJob[]>(queryKey, (current) => mergeGenerationJobUpdate(current, job, allowedIds));
        });
    }, [attemptId, enabled, idsSignature, queryClient]);
    return useQuery({
        queryKey: contentQueryKeys.jobs(attemptId, stableIds),
        queryFn: () => listGenerationJobsByIds(stableIds),
        enabled,
        refetchInterval: (query) => contentGenerationJobsPollingInterval(query.state.data),
    });
}

export function contentGenerationJobsPollingInterval(jobs?: GenerationJob[]) {
    return jobs?.some((job) => job.status === "queued" || job.status === "running") ? 10_000 : false;
}

export function useStartContentTopicFactoryMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: startContentTopicFactory,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
            ]);
        },
    });
}

export function useRegenerateContentTopicFactoryMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: regenerateContentTopicFactory,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
            ]);
        },
    });
}

export function useStopContentTopicFactoryMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: stopContentTopicFactory,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
                queryClient.invalidateQueries({ queryKey: ["content-production", "jobs", attemptId] }),
            ]);
        },
    });
}

export function useOptimizeContentTopicFactoryMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: optimizeContentTopicFactory,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
            ]);
        },
    });
}

export function useStartContentStorylineMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: startContentStorylineOperation,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
                queryClient.invalidateQueries({ queryKey: ["content-production", "jobs", attemptId] }),
            ]);
        },
    });
}

export function useStartContentStoryboardMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: startContentStoryboardOperation,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
                queryClient.invalidateQueries({ queryKey: ["content-production", "jobs", attemptId] }),
            ]);
        },
    });
}

export function useStopContentStoryboardMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: stopContentStoryboard,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.runs(attemptId) }),
                queryClient.invalidateQueries({ queryKey: ["content-production", "jobs", attemptId] }),
            ]);
        },
    });
}

export function useContentNoticeNodesQuery(ownerId: string) {
    return useQuery({
        queryKey: contentQueryKeys.noticeNodes(ownerId),
        queryFn: () => listContentNoticeNodes(ownerId),
        enabled: Boolean(ownerId),
    });
}

export function useKouboNoticesQuery(ownerId: string) {
    return useQuery({
        queryKey: contentQueryKeys.kouboNotices(ownerId),
        queryFn: () => listKouboNotices(ownerId),
        enabled: Boolean(ownerId),
    });
}

export function useMarkContentNodeNoticeSeenMutation(attemptId: string, ownerId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: markContentNodeNoticeSeen,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
                queryClient.invalidateQueries({ queryKey: contentQueryKeys.noticeNodes(ownerId) }),
            ]);
        },
    });
}

export function useContentCompletionsQuery(topicId: string) {
    return useQuery({ queryKey: contentQueryKeys.completions(topicId), queryFn: () => listContentCompletions(topicId), enabled: Boolean(topicId) });
}

export function useOwnerContentRunsQuery(ownerId: string) {
    return useQuery({
        queryKey: contentQueryKeys.ownerRuns(ownerId),
        queryFn: () => listOwnerContentRuns(ownerId),
        enabled: Boolean(ownerId),
        refetchInterval: (query) => query.state.data?.some((run) => ["queued", "producer_running", "reviewer_running", "repairing", "humanizing"].includes(run.status)) ? 2500 : false,
    });
}

export function useContentStagePoliciesQuery() {
    return useQuery({ queryKey: contentQueryKeys.policies, queryFn: listContentStagePolicies, staleTime: 60_000 });
}

export function useContentModelPromptVersionsQuery(stage: string, enabled: boolean) {
    return useQuery({
        queryKey: contentQueryKeys.modelPrompts(stage),
        queryFn: () => listContentModelPromptVersions(stage),
        enabled: enabled && Boolean(stage),
    });
}

export function useSaveCourseScriptModelMutation(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (modelId: string) => saveCourseScriptModel(projectId, modelId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["koubo-workspace", "course-video", projectId] }),
    });
}

export function useSaveContentModelPromptVersionMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: saveContentModelPromptVersion,
        onSuccess: (_, input) => queryClient.invalidateQueries({ queryKey: contentQueryKeys.modelPrompts(input.stage) }),
    });
}

export function useActivateContentModelPromptVersionMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ versionId }: { versionId: string; stage: string }) => activateContentModelPromptVersion(versionId),
        onSuccess: (_, input) => queryClient.invalidateQueries({ queryKey: contentQueryKeys.modelPrompts(input.stage) }),
    });
}

export function useContentProductionStatsQuery(start: string, end: string, memberId?: string) {
    return useQuery({ queryKey: contentQueryKeys.stats(start, end, memberId), queryFn: () => getContentProductionStats(start, end, memberId), enabled: Boolean(start && end) });
}

export function useContentMembersQuery(enabled: boolean) {
    return useQuery({ queryKey: contentQueryKeys.members, queryFn: listContentMembers, enabled });
}

export function useContentActivityQuery(topicId?: string) {
    return useQuery({ queryKey: contentQueryKeys.activity(topicId), queryFn: () => listContentActivityEvents(topicId) });
}

export function useUpdateContentStagePolicyMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ stage, patch }: { stage: string; patch: Parameters<typeof updateContentStagePolicy>[1] }) => updateContentStagePolicy(stage, patch),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.policies }),
    });
}

export function useCreateContentTopicMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateContentTopicInput) => createContentTopic(input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.topics }),
    });
}

export function useClaimContentTopicMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: claimContentTopic,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.topics }),
    });
}

export function useAbandonContentTopicMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ topicId, reason }: { topicId: string; reason: string }) => abandonContentTopic(topicId, reason),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.topics }),
    });
}

export function useCompleteContentTopicMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ topicId, finalAssetIds, notes }: { topicId: string; finalAssetIds: string[]; notes: string }) => completeContentTopic(topicId, finalAssetIds, notes),
        onSuccess: (completion) => {
            void queryClient.invalidateQueries({ queryKey: contentQueryKeys.topic(completion.topicId) });
            void queryClient.invalidateQueries({ queryKey: contentQueryKeys.completions(completion.topicId) });
            void queryClient.invalidateQueries({ queryKey: contentQueryKeys.topics });
        },
    });
}

export function useCreateContentNodeMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createContentNode,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
    });
}

export function useUpdateContentNodeMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ node, patch }: { node: ContentNode; patch: Parameters<typeof updateContentNode>[1] }) => updateContentNode(node, patch),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.nodes(attemptId) }),
    });
}

export function useCreateContentReferenceMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createContentReference,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.references(attemptId) }),
    });
}

export function useDeleteContentReferenceMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteContentReference,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.references(attemptId) }),
    });
}

export function useSelectContentClipMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: selectContentClip,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.selections(attemptId) }),
    });
}

export function useDeselectContentClipMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ shotNodeId, artifactId }: { shotNodeId: string; artifactId: string }) => deselectContentClip(shotNodeId, artifactId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.selections(attemptId) }),
    });
}

export function useCreateContentDeliveryMutation(attemptId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createContentDelivery,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: contentQueryKeys.deliveries(attemptId) }),
    });
}
