import { App, Button, Select, Skeleton, Table, Tag } from "antd";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getModelCatalog } from "@/services/api/model-catalog";
import type { ProviderCatalogModel } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ContentStagePolicy } from "@/types/content-production";
import { useContentStagePoliciesQuery, useUpdateContentStagePolicyMutation } from "./use-content-production";
import { AdminPage } from "@/components/layout/page-shell";

const stageLabels: Record<string, string> = {
    research: "热点研究",
    inspiration_analysis: "灵感解析",
    topic_factory: "Topic 爆点",
    storyline_script: "故事线 / Hook / Script",
    shot_breakdown: "镜头与资源需求",
    storyboard_prompt: "分镜图 Prompt",
    storyboard_image: "分镜图生成",
    tts: "豆包 TTS",
    music: "音乐生成",
    ltx_multimodal: "LTX 多模态请求",
    video: "视频生成与检查",
    koubo_script: "口播文案生成与分段",
};

export default function ContentSettingsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const userId = useUserStore((state) => state.profile?.id || "");
    const policies = useContentStagePoliciesQuery();
    const update = useUpdateContentStagePolicyMutation();
    const [models, setModels] = useState<ProviderCatalogModel[]>([]);

    useEffect(() => {
        void getModelCatalog().then(setModels).catch((error) => message.error(error instanceof Error ? error.message : "模型目录读取失败"));
    }, [message]);

    const optionsByCapability = useMemo(() => new Map(
        ["llm", "image", "video", "speech", "music"].map((capability) => [
            capability,
            models.filter((model) => model.capability === capability).map((model) => ({ value: model.id, label: model.display_name })),
        ]),
    ), [models]);

    const saveModel = async (policy: ContentStagePolicy, key: "producerModelId" | "reviewerModelId" | "fallbackModelId", value: string | null) => {
        try {
            await update.mutateAsync({ stage: policy.stage, patch: { [key]: value, updatedBy: userId } });
            message.success("阶段模型策略已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "阶段模型策略更新失败");
        }
    };

    return (
        <AdminPage
            title="内容生产 AI 编排配置"
            description="在这里切换各阶段模型；System Prompt 从内容节点的提示词调优页签维护，Contract 与 Schema 仍由系统锁定。"
            actions={<Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/content")}>返回内容中心</Button>}
        >
                {policies.isLoading ? <Skeleton active /> : (
                    <Table
                        rowKey="stage"
                        dataSource={policies.data || []}
                        pagination={false}
                        scroll={{ x: 1100 }}
                        columns={[
                            {
                                title: "阶段",
                                fixed: "left",
                                width: 210,
                                render: (_, policy) => <div><div className="font-medium">{stageLabels[policy.stage] || policy.stage}</div><div className="mt-1 text-xs text-stone-400">{policy.stage}</div></div>,
                            },
                            { title: "能力", width: 90, render: (_, policy) => <Tag>{policy.capability}</Tag> },
                            {
                                title: "生成模型",
                                width: 220,
                                render: (_, policy) => (
                                    <ModelSelect value={policy.producerModelId} options={optionsByCapability.get(policy.capability) || []} onChange={(value) => void saveModel(policy, "producerModelId", value)} />
                                ),
                            },
                            {
                                title: "验证模型",
                                width: 220,
                                render: (_, policy) => policy.validationEnabled
                                    ? <ModelSelect value={policy.reviewerModelId} options={optionsByCapability.get(policy.capability === "image" || policy.capability === "video" ? "llm" : policy.capability) || []} onChange={(value) => void saveModel(policy, "reviewerModelId", value)} />
                                    : <Tag>无需验证</Tag>,
                            },
                            {
                                title: "Fallback",
                                width: 220,
                                render: (_, policy) => <ModelSelect allowClear value={policy.fallbackModelId} options={optionsByCapability.get(policy.capability) || []} onChange={(value) => void saveModel(policy, "fallbackModelId", value)} />,
                            },
                            {
                                title: "系统规则",
                                render: (_, policy) => (
                                    <div className="text-xs leading-5 text-stone-500">
                                        <div className="flex items-center gap-1.5"><LockKeyhole className="size-3.5" />阶段协议 {policy.promptKey}@{policy.promptVersion}</div>
                                        <div>Schema {policy.schemaVersion} · 最多 {policy.maxRounds} 轮{policy.mediaRetryLimit ? ` · 媒体失败重试 ${policy.mediaRetryLimit} 次` : ""}</div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
        </AdminPage>
    );
}

function ModelSelect({ value, options, allowClear, onChange }: { value: string | null; options: Array<{ value: string; label: string }>; allowClear?: boolean; onChange: (value: string | null) => void }) {
    return <Select showSearch optionFilterProp="label" allowClear={allowClear} value={value || undefined} placeholder="选择模型" className="w-full" options={options} onChange={(next) => onChange(next || null)} />;
}
