import { Alert, App, Button, Empty, Input, List, Modal, Select, Skeleton, Space, Tag } from "antd";
import { History, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
    ContentGenerationRun,
    ContentModelPromptBinding,
    ContentModelPromptVersion,
    ContentNode,
} from "@/types/content-production";
import { contentTopicFactorySnapshot } from "@/lib/content-production/topic-factory";
import { contentStorylineSnapshot } from "@/lib/content-production/storyline";
import { contentStoryboardSnapshot } from "@/lib/content-production/storyboard";
import {
    useActivateContentModelPromptVersionMutation,
    useContentModelPromptVersionsQuery,
    useSaveContentModelPromptVersionMutation,
} from "../use-content-production";

const stageLabels: Record<string, string> = {
    research: "热点研究",
    inspiration_analysis: "灵感解析",
    topic_factory: "Topic 爆点",
    storyline_script: "故事线",
    shot_breakdown: "镜头拆解",
    storyboard_prompt: "分镜图 Prompt",
    storyboard_image: "分镜图生成",
    tts: "角色语音",
    music: "音乐生成",
    ltx_multimodal: "多模态视频请求",
    video: "视频生成与检查",
    koubo_script: "口播文案",
    course_script: "课程文案",
    course_scene: "课程场景",
    course_video: "课程视频",
};

export type ContentModelPromptTuningModelSelection = {
    stage: ContentModelPromptBinding["stage"];
    label: string;
    value: string;
    options: Array<{ value: string; modelId: string; label: string }>;
    requiredPurposeKeys: string[];
    loading: boolean;
    onChange: (value: string) => void;
};

export type ContentModelPromptGroup = {
    key: string;
    label: string;
    binding: ContentModelPromptBinding;
    usedVersion: number;
    activeVersion?: ContentModelPromptVersion;
    versions: ContentModelPromptVersion[];
};

export function contentModelPromptGroups(
    bindings: ContentModelPromptBinding[],
    versions: ContentModelPromptVersion[],
) {
    const groups = new Map<string, ContentModelPromptGroup>();
    for (const binding of bindings) {
        if (binding.stage === "storyline_script" && binding.purposeKey === "repair") continue;
        const key = binding.purposeKey;
        if (groups.has(key)) continue;
        const history = versions
            .filter((version) => version.stage === binding.stage && version.purposeKey === binding.purposeKey)
            .sort((a, b) => b.version - a.version);
        groups.set(key, {
            key,
            label: binding.purposeLabel,
            binding,
            usedVersion: binding.version,
            activeVersion: history.find((version) => version.active),
            versions: history,
        });
    }
    return [...groups.values()];
}

export function contentModelPromptIsDirty(draft: string, active?: ContentModelPromptVersion) {
    return Boolean(active && draft !== active.systemPrompt);
}

export function contentModelPromptFallbackStage(
    node: ContentNode | null,
    run: ContentGenerationRun | null,
): ContentModelPromptBinding["stage"] | undefined {
    if (run || !node) return undefined;
    if (contentTopicFactorySnapshot(node)) return "topic_factory";
    if (contentStorylineSnapshot(node) || node.nodeType === "storyline") return "storyline_script";
    if (contentStoryboardSnapshot(node)) return "shot_breakdown";
    return undefined;
}

function activeContentModelPromptBindings(stage: ContentModelPromptBinding["stage"], versions: ContentModelPromptVersion[]) {
    return versions
        .filter((version) => version.stage === stage && version.active)
        .map(({ promptId, purposeKey, purposeLabel, version }) => ({
            promptId,
            stage,
            purposeKey,
            purposeLabel,
            modelId: "",
            version,
        }));
}

export function ContentModelPromptTuning({
    run,
    fallbackStage,
    includeActivePurposes = [],
    promptPurposeKey,
    modelSelection,
    onDirtyChange,
}: {
    run: ContentGenerationRun | null;
    fallbackStage?: ContentModelPromptBinding["stage"];
    includeActivePurposes?: string[];
    promptPurposeKey?: string;
    modelSelection?: ContentModelPromptTuningModelSelection;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const { message, modal } = App.useApp();
    const currentConfigMode = Boolean(modelSelection && promptPurposeKey);
    const stage = currentConfigMode ? modelSelection!.stage : run?.stage || fallbackStage;
    const nextRunMode = currentConfigMode || (!run && Boolean(fallbackStage));
    const query = useContentModelPromptVersionsQuery(stage || "", Boolean(run || fallbackStage));
    const modelPromptQuery = useContentModelPromptVersionsQuery(modelSelection?.stage || "", Boolean(modelSelection));
    const save = useSaveContentModelPromptVersionMutation();
    const activate = useActivateContentModelPromptVersionMutation();
    const bindings = useMemo(() => {
        if (!stage) return [];
        const current = (!currentConfigMode && run?.modelPromptBindings) || activeContentModelPromptBindings(stage, query.data || [])
            .filter((binding) => !promptPurposeKey || binding.purposeKey === promptPurposeKey);
        const included = activeContentModelPromptBindings(stage, query.data || [])
            .filter((binding) => includeActivePurposes.includes(binding.purposeKey));
        const keys = new Set(current.map((binding) => binding.purposeKey));
        return [...current, ...included.filter((binding) => !keys.has(binding.purposeKey))];
    }, [currentConfigMode, includeActivePurposes, promptPurposeKey, query.data, run?.modelPromptBindings, stage]);
    const groups = useMemo(
        () => contentModelPromptGroups(bindings, query.data || []),
        [bindings, query.data],
    );
    const [selectedKey, setSelectedKey] = useState("");
    const [draft, setDraft] = useState("");
    const [previewId, setPreviewId] = useState<string | null>(null);
    const selected = groups.find((group) => group.key === selectedKey) || groups[0];
    const active = selected?.activeVersion;
    const preview = selected?.versions.find((version) => version.promptId === previewId);
    const dirty = contentModelPromptIsDirty(draft, active);
    const modelOptions = useMemo(() => modelSelection?.options.map((option) => {
        const activePurposes = new Set((modelPromptQuery.data || [])
            .filter((version) => version.active)
            .map((version) => version.purposeKey));
        const ready = modelSelection.requiredPurposeKeys.every((purposeKey) => activePurposes.has(purposeKey));
        return {
            value: option.value,
            label: ready ? option.label : `${option.label}（Prompt 未配置完整）`,
            disabled: !ready,
        };
    }) || [], [modelPromptQuery.data, modelSelection]);

    useEffect(() => {
        const firstKey = groups[0]?.key || "";
        if (!groups.some((group) => group.key === selectedKey)) setSelectedKey(firstKey);
    }, [groups, selectedKey]);

    useEffect(() => {
        setDraft(active?.systemPrompt || "");
        setPreviewId(null);
    }, [active?.promptId, selected?.key]);

    useEffect(() => {
        onDirtyChange(dirty);
    }, [dirty, onDirtyChange]);

    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    if (!run && !fallbackStage) {
        return <Empty className="px-5 py-16" image={Empty.PRESENTED_IMAGE_SIMPLE} description="此节点不是模型生成，没有相关 System Prompt" />;
    }
    if (run && !bindings.length) {
        return <Empty className="px-5 py-16" image={Empty.PRESENTED_IMAGE_SIMPLE} description="旧记录未保存具体 Prompt 绑定" />;
    }
    if (query.isLoading) return <div className="p-5"><Skeleton active /></div>;
    if (query.isError) {
        return (
            <div className="p-5">
                <Alert
                    type="error"
                    showIcon
                    message="System Prompt 读取失败"
                    description={query.error instanceof Error ? query.error.message : "请稍后重试"}
                    action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>}
                />
            </div>
        );
    }
    if (!selected) {
        return <Empty className="px-5 py-16" image={Empty.PRESENTED_IMAGE_SIMPLE} description={nextRunMode ? `${stageLabels[stage] || stage}当前没有已激活的 System Prompt` : "当前生成记录没有可调优的 System Prompt"} />;
    }

    const selectGroup = (nextKey: string) => {
        if (!dirty) {
            setSelectedKey(nextKey);
            return;
        }
        modal.confirm({
            title: "放弃未保存的 Prompt 修改？",
            content: "切换用途后，当前编辑内容不会保留。",
            okText: "放弃修改",
            cancelText: "继续编辑",
            onOk: () => setSelectedKey(nextKey),
        });
    };
    const saveVersion = async () => {
        if (!active || !draft.trim()) return;
        try {
            await save.mutateAsync({
                stage: active.stage,
                purposeKey: active.purposeKey,
                purposeLabel: active.purposeLabel,
                systemPrompt: draft,
            });
            await query.refetch();
            message.success("System Prompt 新版本已保存并激活");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "System Prompt 保存失败");
        }
    };
    const activateVersion = (version: ContentModelPromptVersion) => {
        modal.confirm({
            title: `激活 v${version.version}？`,
            content: "激活后，后续新启动的内容任务将使用这个历史版本；正在运行的任务不受影响。",
            okText: "激活版本",
            cancelText: "取消",
            onOk: async () => {
                try {
                    await activate.mutateAsync({ versionId: version.promptId, stage: version.stage });
                    await query.refetch();
                    message.success(`v${version.version} 已激活`);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "Prompt 版本激活失败");
                    throw error;
                }
            },
        });
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto p-5" data-canvas-scroll>
            {modelSelection ? <label className="mb-5 block">
                <span className="mb-2 block text-xs text-muted-foreground">{modelSelection.label}</span>
                <Select
                    className="w-full"
                    aria-label={modelSelection.label}
                    value={modelSelection.value || undefined}
                    options={modelOptions}
                    loading={modelSelection.loading || modelPromptQuery.isLoading}
                    placeholder="请选择模型"
                    status={!modelSelection.value ? "error" : undefined}
                    onChange={modelSelection.onChange}
                />
                <span className="mt-2 block text-xs text-muted-foreground">模型会保存到当前项目，后续课程文案生成与优化将使用该模型。</span>
            </label> : null}
            <div className="mb-5">
                <div className="text-xs text-muted-foreground">产生阶段</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{stageLabels[stage] || stage}</span>
                    {nextRunMode ? <Tag color="blue">下次启动使用</Tag> : <Tag>此节点使用 v{selected.usedVersion}</Tag>}
                    {active ? <Tag color={active.version === selected.usedVersion ? "green" : "blue"}>当前激活 v{active.version}</Tag> : <Tag color="red">缺少激活版本</Tag>}
                </div>
                {nextRunMode ? <div className="mt-2 text-xs text-muted-foreground">这是当前激活配置，不是历史运行快照。</div> : null}
            </div>

            {!promptPurposeKey ? <label className="block">
                <span className="mb-2 block text-xs text-muted-foreground">用途</span>
                <Select
                    className="w-full"
                    value={selected.key}
                    options={groups.map((group) => ({ value: group.key, label: group.label }))}
                    onChange={selectGroup}
                />
            </label> : null}

            {active ? (
                <>
                    <label className="mt-5 block">
                        <span className="mb-2 block text-xs text-muted-foreground">当前 System Prompt</span>
                        <Input.TextArea
                            value={draft}
                            autoSize={{ minRows: 14, maxRows: 28 }}
                            onChange={(event) => setDraft(event.target.value)}
                        />
                    </label>
                    <div className="pt-4">
                        <Button
                            type="primary"
                            icon={<Save className="size-4" />}
                            loading={save.isPending}
                            disabled={!dirty || !draft.trim()}
                            onClick={() => void saveVersion()}
                        >
                            保存新版本
                        </Button>
                    </div>
                </>
            ) : (
                <Alert className="mt-5" type="error" showIcon message="当前组合缺少激活的 System Prompt" />
            )}

            <div className="mb-2 mt-7 flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h3 className="font-medium">版本历史</h3>
            </div>
            <List
                dataSource={selected.versions}
                locale={{ emptyText: "没有历史版本" }}
                renderItem={(version) => (
                    <List.Item
                        actions={[
                            <Button key="preview" type="link" size="small" onClick={() => setPreviewId(version.promptId)}>预览</Button>,
                            <Button
                                key="activate"
                                type="link"
                                size="small"
                                icon={<RotateCcw className="size-3.5" />}
                                disabled={version.active}
                                loading={activate.isPending}
                                onClick={() => activateVersion(version)}
                            >
                                激活
                            </Button>,
                        ]}
                    >
                        <Space size={8} wrap>
                            <span>v{version.version}</span>
                            {version.active ? <Tag color="green">当前激活</Tag> : null}
                            {!nextRunMode && version.version === selected.usedVersion ? <Tag>此节点使用</Tag> : null}
                            <span className="text-xs text-muted-foreground">{formatTime(version.createdAt)}</span>
                        </Space>
                    </List.Item>
                )}
            />
            <Modal
                title={preview ? `v${preview.version} Prompt 预览` : "Prompt 预览"}
                open={Boolean(preview)}
                footer={null}
                width={760}
                destroyOnHidden
                focusable={{ focusTriggerAfterClose: true }}
                onCancel={() => setPreviewId(null)}
            >
                {preview ? (
                    <>
                        <div className="mb-4 grid gap-3 sm:grid-cols-2">
                            {[
                                ["用途", preview.purposeLabel],
                                ["版本状态", preview.active ? "当前激活" : "历史版本"],
                                ["创建时间", formatTime(preview.createdAt) || "—"],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <div className="text-xs text-muted-foreground">{label}</div>
                                    <div className="mt-1 break-words">{value}</div>
                                </div>
                            ))}
                        </div>
                        <label className="block">
                            <span className="mb-2 block text-xs text-muted-foreground">System Prompt</span>
                            <Input.TextArea value={preview.systemPrompt} readOnly autoSize={{ minRows: 12, maxRows: 24 }} />
                        </label>
                    </>
                ) : null}
            </Modal>
        </div>
    );
}

function formatTime(value: string) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
