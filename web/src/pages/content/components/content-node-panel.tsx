import { App, Button, Divider, Input, Select, Space, Tag } from "antd";
import { Play, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { contentNodePanelKind } from "@/lib/content-production/content-workboard";
import { contentNodeStageActions } from "@/lib/content-production/content-tree";
import { contentTopicFactorySnapshot } from "@/lib/content-production/topic-factory";
import { contentStorylineSnapshot } from "@/lib/content-production/storyline";
import { contentStoryboardSnapshot } from "@/lib/content-production/storyboard";
import type { AudioSegmentationSubmit } from "@/lib/audio/segmentation";
import type { GenerationJob } from "@/services/api/generation-client";
import type { ContentNode, ContentStage } from "@/types/content-production";
import { TopicAngleDetails } from "./topic-angle-details";
import { StorylineDetails } from "./storyline-details";
import { StoryboardDetails } from "./storyboard-details";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./content-node-panel-tabs";
import { AudioSegmentationPanel } from "@/components/audio/audio-segmentation-panel";

const panelLabels = {
    text: "文本与 LLM",
    image: "图片与分镜",
    video: "LTX 多模态视频",
    audio: "角色语音",
    music: "音乐",
    batch: "生成批次",
} as const;

export function ContentNodePanel({
    node,
    editable,
    saving,
    onSave,
    onGenerate,
    references,
    modelOptions,
    clipResults,
    jobs = [],
    panelTab = "content",
    tuningEnabled = false,
    tuning = null,
    onPanelTabChange = () => undefined,
    onSegmentAudio,
}: {
    node: ContentNode;
    editable: boolean;
    saving: boolean;
    onSave: (patch: Pick<ContentNode, "title" | "summary" | "data">, sourceNode?: ContentNode) => Promise<ContentNode>;
    onGenerate: (node: ContentNode, stage?: ContentStage, prepare?: () => Promise<ContentNode>) => Promise<void>;
    references: ReactNode;
    modelOptions: Array<{ value: string; label: string }>;
    clipResults?: ReactNode;
    jobs?: GenerationJob[];
    panelTab?: ContentNodePanelTab;
    tuningEnabled?: boolean;
    tuning?: ReactNode;
    onPanelTabChange?: (tab: ContentNodePanelTab) => void;
    onSegmentAudio?: (input: AudioSegmentationSubmit) => Promise<void>;
}) {
    const { message } = App.useApp();
    const [title, setTitle] = useState(node.title);
    const [summary, setSummary] = useState(node.summary);
    const [prompt, setPrompt] = useState(String(node.data.prompt || ""));
    const [model, setModel] = useState(String(node.data.model || ""));
    const [count, setCount] = useState(Number(node.data.count || (node.nodeType === "video" ? 4 : 1)));
    const [voice, setVoice] = useState(String(node.data.voice || ""));
    const [duration, setDuration] = useState(String(node.data.duration || "6"));
    const [content, setContent] = useState(() => contentText(node));
    const panelKind = contentNodePanelKind(node.nodeType);
    const actions = useMemo(() => contentNodeStageActions(node.nodeType), [node.nodeType]);

    useEffect(() => {
        setTitle(node.title);
        setSummary(node.summary);
        setPrompt(String(node.data.prompt || ""));
        setModel(String(node.data.model || ""));
        setCount(Number(node.data.count || (node.nodeType === "video" ? 4 : 1)));
        setVoice(String(node.data.voice || ""));
        setDuration(String(node.data.duration || "6"));
        setContent(contentText(node));
    }, [node]);

    const nextData = () => {
        const data: Record<string, unknown> = { ...node.data, prompt, ...(model ? { model } : {}), count, voice, duration };
        if (node.data.structuredOutput !== undefined) {
            try {
                data.structuredOutput = JSON.parse(content);
            } catch {
                throw new Error("结构化内容必须是有效 JSON");
            }
        } else if (node.data.content !== undefined) data.content = content;
        return data;
    };
    const save = async () => {
        try {
            await onSave({ title: title.trim() || node.title, summary, data: nextData() });
            message.success("节点已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "节点保存失败");
        }
    };
    const generate = async (stage?: ContentStage) => {
        try {
            const nextNode = { ...node, title: title.trim() || node.title, summary, data: nextData() };
            await onSave({ title: nextNode.title, summary: nextNode.summary, data: nextNode.data });
            await onGenerate(nextNode, stage);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成失败");
        }
    };

    if (contentTopicFactorySnapshot(node)) {
        return <TopicAngleDetails
            node={node}
            jobs={jobs}
            editable={editable}
            generating={saving}
            onSave={onSave}
            onContinue={(latestNode, prepare) => onGenerate(latestNode, "storyline_script", prepare)}
            panelTab={panelTab}
            tuningEnabled={tuningEnabled}
            tuning={tuning}
            onPanelTabChange={onPanelTabChange}
        />;
    }

    if (contentStorylineSnapshot(node)) {
        return <StorylineDetails
            node={node}
            jobs={jobs}
            editable={editable}
            generating={saving}
            onSave={onSave}
            onContinue={(latestNode) => onGenerate(latestNode || node, "shot_breakdown")}
            panelTab={panelTab}
            tuningEnabled={tuningEnabled}
            tuning={tuning}
            onPanelTabChange={onPanelTabChange}
        />;
    }

    if (contentStoryboardSnapshot(node)) {
        return <StoryboardDetails
            node={node}
            editable={editable}
            generating={saving}
            panelTab={panelTab}
            tuningEnabled={tuningEnabled}
            tuning={tuning}
            onPanelTabChange={onPanelTabChange}
            onContinue={() => onGenerate(node, "storyboard_prompt")}
        />;
    }

    if (node.nodeType === "tts" && node.status === "succeeded" && typeof node.data.url === "string" && onSegmentAudio) {
        return (
            <ContentNodePanelTabs
                activeKey={panelTab}
                tuningEnabled={false}
                content={(
                    <AudioSegmentationPanel
                        nodeId={node.id}
                        title={node.title}
                        url={node.data.url}
                        durationMs={typeof node.data.durationMs === "number" ? node.data.durationMs : undefined}
                        submitting={saving}
                        disabled={!editable}
                        onSubmit={onSegmentAudio}
                    />
                )}
                tuning={null}
                contentWidthClass="w-[390px]"
                onChange={onPanelTabChange}
            />
        );
    }

    const contentPanel = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-800">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs text-stone-500">{panelLabels[panelKind]}</div>
                        <h2 className="mt-1 font-semibold">{node.title}</h2>
                    </div>
                    <Tag>{node.status}</Tag>
                </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5" data-canvas-scroll>
                <Field label="节点标题">
                    <Input value={title} disabled={!editable} onChange={(event) => setTitle(event.target.value)} />
                </Field>
                <Field label={panelKind === "text" ? "正文 / 摘要" : "用途与说明"}>
                    <Input.TextArea value={summary} disabled={!editable} autoSize={{ minRows: 4, maxRows: 12 }} onChange={(event) => setSummary(event.target.value)} />
                </Field>
                {node.data.structuredOutput !== undefined || node.data.content !== undefined ? (
                    <Field label={node.data.structuredOutput !== undefined ? "结构化内容（JSON）" : "完整文本内容"}>
                        <Input.TextArea value={content} disabled={!editable} autoSize={{ minRows: 8, maxRows: 24 }} onChange={(event) => setContent(event.target.value)} />
                    </Field>
                ) : null}
                <TypeSpecificHelp panelKind={panelKind} node={node} />
                {panelKind !== "batch" ? (
                    <Field label={panelKind === "text" ? "运行方式 / 探索模型" : "本次探索使用的模型"}>
                        <Select showSearch allowClear optionFilterProp="label" value={model || undefined} disabled={!editable} placeholder={panelKind === "text" ? "自动编排（System Prompt + Reviewer）" : "使用当前阶段模型"} options={modelOptions} onChange={(value) => setModel(value || "")} />
                    </Field>
                ) : null}
                {panelKind === "image" || panelKind === "video" ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="批量数量"><Select value={count} disabled={!editable} options={[1, 2, 3, 4, 6, 8].map((value) => ({ value, label: `${value} 个` }))} onChange={setCount} /></Field>
                        {panelKind === "video" ? <Field label="时长"><Select value={duration} disabled={!editable} options={["5", "6", "8", "10"].map((value) => ({ value, label: `${value} 秒` }))} onChange={setDuration} /></Field> : <div />}
                    </div>
                ) : null}
                {panelKind === "audio" ? <Field label="角色 Voice / Speaker ID"><Input value={voice} disabled={!editable} placeholder="选择或输入固定角色 Voice" onChange={(event) => setVoice(event.target.value)} /></Field> : null}
                <Field label={panelKind === "video" ? "多模态生成指令" : panelKind === "audio" ? "台词与表达指令" : panelKind === "music" ? "音乐生成指令" : "探索 Prompt"}>
                    <Input.TextArea
                        value={prompt}
                        disabled={!editable}
                        autoSize={{ minRows: 5, maxRows: 14 }}
                        placeholder="Owner 的探索 Prompt 可自由修改；自动流程的核心 System Prompt 由系统版本化维护。"
                        onChange={(event) => setPrompt(event.target.value)}
                    />
                </Field>
                <Space wrap>
                    <Button disabled={!editable} loading={saving} icon={<Save className="size-4" />} onClick={() => void save()}>保存</Button>
                    {actions.map((stage) => (
                        <Button key={stage} type="primary" disabled={!editable} loading={saving} icon={<Play className="size-4" />} onClick={() => void generate(stage)}>
                            {stageActionLabel(stage)}
                        </Button>
                    ))}
                    {!actions.length && panelKind !== "text" ? (
                        <Button type="primary" disabled={!editable} loading={saving} icon={<Play className="size-4" />} onClick={() => void generate()}>生成分支</Button>
                    ) : null}
                </Space>
                <Divider />
                {references}
                {clipResults ? <><Divider />{clipResults}</> : null}
            </div>
        </div>
    );
    return (
        <ContentNodePanelTabs
            activeKey={panelTab}
            tuningEnabled={tuningEnabled}
            content={contentPanel}
            tuning={tuning}
            contentWidthClass="w-[390px]"
            onChange={onPanelTabChange}
        />
    );
}

function stageActionLabel(stage: ContentStage) {
    const labels: Partial<Record<ContentStage, string>> = {
        research: "生成调研分支",
        storyline_script: "生成故事线",
        shot_breakdown: "生成镜头拆解",
        storyboard_prompt: "生成分镜提示词",
        storyboard_image: "生成分镜图",
        tts: "生成角色语音",
        music: "生成音乐",
        ltx_multimodal: "生成视频",
    };
    return labels[stage] || "生成分支";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-2 block text-xs text-stone-500">{label}</span>{children}</label>;
}

function TypeSpecificHelp({ panelKind, node }: { panelKind: ReturnType<typeof contentNodePanelKind>; node: ContentNode }) {
    if (panelKind === "video") {
        return <div className="rounded-xl bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">V1 使用 LTX 多模态：文字、参考图/帧与可用音频共同生成 Clip；不使用 Timeline、Director 或 Relay。</div>;
    }
    if (panelKind === "audio") {
        return <div className="rounded-xl bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">Voice 在这个节点选择；豆包 TTS 直出，不进入自动 reviewer 验证。</div>;
    }
    if (panelKind === "image") {
        return <div className="rounded-xl bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">结构化镜头可列出角色、场景、道具和 Voice 需求；V1 仅显式引用素材，不做自动素材匹配。</div>;
    }
    if (panelKind === "batch") {
        return <div className="rounded-xl bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">同一根节点可反复生成批次并保留全部结果。{node.nodeType === "batch" ? " 选中满意的结果继续建立分支。" : ""}</div>;
    }
    return null;
}

function contentText(node: ContentNode) {
    if (node.data.structuredOutput !== undefined) return JSON.stringify(node.data.structuredOutput, null, 2);
    return typeof node.data.content === "string" ? node.data.content : "";
}
