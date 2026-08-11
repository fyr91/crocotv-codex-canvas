import { Alert, App, Button, Collapse, Descriptions, Input, Progress, Select, Tag } from "antd";
import { ArrowRight, CheckCircle2, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { saveAs } from "file-saver";

import { CanvasNodeReasoningBox } from "@/components/canvas/canvas-node-reasoning-box";
import {
    parseTopicAngleTransfer,
    serializeTopicAngleTransfer,
    topicAngleCandidatePatch,
    type TopicAngleTransfer,
} from "@/lib/content-production/topic-angle-transfer";
import { canExpandTopicAngle, contentTopicFactorySnapshot, topicFactoryPhaseLabel } from "@/lib/content-production/topic-factory";
import type { GenerationJob } from "@/services/api/generation-client";
import type { ContentNode, ContentTopicCitation, ContentTopicFactoryCandidate } from "@/types/content-production";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./content-node-panel-tabs";

const dimensionLabels: Record<string, string> = {
    audience_relevance: "受众相关性",
    specificity: "场景具体度",
    conflict_or_information_gap: "冲突 / 信息差",
    payoff: "收益兑现",
    credibility: "可信度",
    content_fit: "内容适配度",
};

const payoffOptions = [
    { value: "emotional", label: "情绪" },
    { value: "practical", label: "实用" },
    { value: "identity", label: "身份" },
    { value: "financial", label: "经济" },
    { value: "social", label: "社交" },
];

export function TopicAngleDetails({
    node,
    jobs,
    editable,
    generating,
    onSave,
    onContinue,
    panelTab = "content",
    tuningEnabled = false,
    tuning = null,
    onPanelTabChange = () => undefined,
}: {
    node: ContentNode;
    jobs: GenerationJob[];
    editable: boolean;
    generating: boolean;
    onSave: (patch: Pick<ContentNode, "title" | "summary" | "data">, sourceNode?: ContentNode) => Promise<ContentNode>;
    onContinue: (node: ContentNode, prepare: () => Promise<ContentNode>) => Promise<void>;
    panelTab?: ContentNodePanelTab;
    tuningEnabled?: boolean;
    tuning?: ReactNode;
    onPanelTabChange?: (tab: ContentNodePanelTab) => void;
}) {
    const { message } = App.useApp();
    const snapshot = contentTopicFactorySnapshot(node);
    const candidate = snapshot?.candidate || null;
    const [draft, setDraft] = useState<ContentTopicFactoryCandidate | null>(candidate);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeNodeIdRef = useRef(node.id);
    const latestNodeRef = useRef(node);
    const draftRef = useRef(candidate);
    const savedSignatureRef = useRef(candidate ? candidateSignature(candidate) : "");
    const queuedSignatureRef = useRef(savedSignatureRef.current);
    const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
    const incomingSignature = candidate ? candidateSignature(candidate) : "";

    useEffect(() => {
        latestNodeRef.current = node;
        if (activeNodeIdRef.current !== node.id) {
            activeNodeIdRef.current = node.id;
            draftRef.current = candidate;
            savedSignatureRef.current = incomingSignature;
            queuedSignatureRef.current = incomingSignature;
            setDraft(candidate);
            return;
        }
        const draftSignature = draftRef.current ? candidateSignature(draftRef.current) : "";
        const previousSaved = savedSignatureRef.current;
        if (incomingSignature === queuedSignatureRef.current) savedSignatureRef.current = incomingSignature;
        if (draftSignature === previousSaved) {
            draftRef.current = candidate;
            savedSignatureRef.current = incomingSignature;
            queuedSignatureRef.current = incomingSignature;
            setDraft(candidate);
        }
    }, [incomingSignature, node.id, node.revision]);

    if (!snapshot) return null;
    const review = snapshot.review;
    const currentJob = jobs.find((job) => ["queued", "running"].includes(job.status)) || jobs.at(-1);
    const isReviewing = snapshot.phase === "reviewing";
    const canContinue = editable && canExpandTopicAngle(node);
    const canEditCandidate = editable && canExpandTopicAngle(node) && Boolean(draft);

    const transferValue = (nextCandidate = draftRef.current): TopicAngleTransfer | null => nextCandidate ? {
        format: "crocotv.topic-angle",
        version: 2,
        candidate: nextCandidate,
        citations: snapshot.citations,
        verification: snapshot.review,
    } : null;
    const persistTransfer = async (value: TopicAngleTransfer) => {
        const normalized = parseTopicAngleTransfer(serializeTopicAngleTransfer(value));
        const signature = candidateSignature(normalized.candidate);
        if (signature === savedSignatureRef.current || signature === queuedSignatureRef.current) return;
        queuedSignatureRef.current = signature;
        const request = saveQueueRef.current.then(async () => {
            const sourceNode = latestNodeRef.current;
            const updated = await onSave(topicAngleCandidatePatch(sourceNode, normalized), sourceNode);
            latestNodeRef.current = updated;
            savedSignatureRef.current = signature;
        });
        saveQueueRef.current = request.catch(() => undefined);
        try {
            await request;
        } catch (error) {
            if (queuedSignatureRef.current === signature) queuedSignatureRef.current = savedSignatureRef.current;
            message.error(error instanceof Error ? error.message : "选题自动保存失败");
        }
    };
    const updateDraft = (value: ContentTopicFactoryCandidate) => {
        draftRef.current = value;
        setDraft(value);
    };
    const commitDraft = () => {
        const value = transferValue();
        if (value) void persistTransfer(value);
    };
    const downloadJson = () => {
        const value = transferValue();
        if (!value) return;
        try {
            const fileName = `${value.candidate.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "选题分支"}.json`;
            saveAs(new Blob([serializeTopicAngleTransfer(value)], { type: "application/json;charset=utf-8" }), fileName);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "选题 JSON 下载失败");
        }
    };
    const importJson = async (file: File) => {
        try {
            const imported = parseTopicAngleTransfer(await file.text());
            draftRef.current = imported.candidate;
            setDraft(imported.candidate);
            await persistTransfer(imported);
            message.success("选题 JSON 已导入");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "选题 JSON 导入失败");
        }
    };
    const continueWithSavedDraft = async () => {
        const value = transferValue();
        const sourceNode = value
            ? { ...latestNodeRef.current, ...topicAngleCandidatePatch(latestNodeRef.current, value) }
            : latestNodeRef.current;
        await onContinue(sourceNode, async () => {
            if (value) await persistTransfer(value);
            await saveQueueRef.current;
            return latestNodeRef.current;
        });
    };

    const contentPanel = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">选题分支 {snapshot.laneNumber} · {snapshot.laneStrategy}</div>
                        <h2 className="mt-1 truncate font-semibold">{draft?.title || candidate?.title || node.title}</h2>
                    </div>
                    <Tag color={snapshot.phase === "ready_pass" ? "green" : snapshot.phase === "ready_warning" ? "gold" : snapshot.phase === "error" ? "red" : "blue"}>
                        {topicFactoryPhaseLabel(snapshot.phase)}
                    </Tag>
                </div>
                {draft ? (
                    <div className="mt-3 flex items-center gap-2">
                        <Button size="small" icon={<Download className="size-3.5" />} onClick={downloadJson}>
                            下载 JSON
                        </Button>
                        {editable ? (
                            <>
                                <Button size="small" icon={<Upload className="size-3.5" />} disabled={generating} onClick={() => fileInputRef.current?.click()}>
                                    导入 JSON
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    className="hidden"
                                    type="file"
                                    accept="application/json,.json"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = "";
                                        if (file) void importJson(file);
                                    }}
                                />
                            </>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5" data-canvas-scroll>
                {currentJob && ["queued", "generating", "persisting", "reviewing", "revising", "humanizing"].includes(snapshot.phase) ? (
                    <div className="mb-5">
                        <CanvasNodeReasoningBox
                            text={currentJob.reasoning_text || ""}
                            running={["queued", "running"].includes(currentJob.status)}
                            runningLabel={isReviewing ? "验证中" : snapshot.phase === "humanizing" ? "去 AI 化中" : snapshot.phase === "revising" ? "调整中" : "生成中"}
                            completeLabel={isReviewing ? "验证过程" : snapshot.phase === "humanizing" ? "去 AI 化过程" : "思考过程"}
                        />
                    </div>
                ) : null}
                {snapshot.error ? <Alert className="mt-5" type="error" showIcon message={snapshot.error} /> : null}
                {snapshot.warning ? <Alert className="mt-5" type="warning" showIcon message={snapshot.warning} /> : null}
                {draft ? (
                    canEditCandidate ? (
                            <TopicCandidateEditor
                                candidate={draft}
                                citations={snapshot.citations}
                                onChange={updateDraft}
                                onCommit={commitDraft}
                            />
                        ) : (
                        <TopicCandidateView candidate={draft} citations={snapshot.citations} />
                    )
                ) : null}
                {review ? (
                    <section className="mt-6 rounded-xl border border-border p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className={`size-5 ${review.verdict === "pass" ? "text-primary" : "text-destructive"}`} />
                            <div className="font-medium">GLM 验证 · 第 {snapshot.reviewCycle} 轮</div>
                            <div className="ml-auto text-lg font-semibold">{review.total_score}</div>
                        </div>
                        <Progress percent={review.total_score} showInfo={false} status={review.verdict === "pass" ? "success" : "exception"} />
                        {review.blocking_issues.length ? <Alert className="mt-3" type="warning" showIcon message="待解决问题" description={review.blocking_issues.join("；")} /> : null}
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                            {Object.entries(review.dimension_scores).map(([key, score]) => (
                                <div key={key} className="flex justify-between gap-2"><span>{dimensionLabels[key] || key}</span><span className="text-foreground">{score}</span></div>
                            ))}
                        </div>
                    </section>
                ) : null}
                {jobs.length ? (
                    <Collapse
                        className="mt-5"
                        ghost
                        items={[{
                            key: "process",
                            label: `生成与验证记录（${jobs.length}）`,
                            children: (
                            <div className="space-y-3">
                                {jobs.map((job, index) => (
                                    <div key={job.id} className="rounded-lg border border-border p-3 text-xs">
                                        <div className="flex justify-between gap-3"><span>模型任务 {index + 1}</span><Tag>{job.status}</Tag></div>
                                        {job.reasoning_text ? <p className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">{job.reasoning_text}</p> : null}
                                        {job.error_message ? <p className="mt-2 text-destructive">{job.error_message}</p> : null}
                                    </div>
                                ))}
                            </div>
                            ),
                        }]}
                    />
                ) : null}
            </div>
            <div className="space-y-2 border-t border-border p-4">
                <Button
                    type="primary"
                    block
                    icon={<ArrowRight className="size-4" />}
                    disabled={!canContinue}
                    loading={generating}
                    onClick={() => void continueWithSavedDraft().catch((error) => {
                        message.error(error instanceof Error ? error.message : "故事线任务启动失败");
                    })}
                >
                    基于此选题生成故事线
                </Button>
            </div>
        </div>
    );
    return (
        <ContentNodePanelTabs
            activeKey={panelTab}
            tuningEnabled={tuningEnabled}
            content={contentPanel}
            tuning={tuning}
            contentWidthClass="w-[410px]"
            onChange={onPanelTabChange}
        />
    );
}

function TopicCandidateEditor({
    candidate,
    citations,
    onChange,
    onCommit,
}: {
    candidate: ContentTopicFactoryCandidate;
    citations: ContentTopicCitation[];
    onChange: (candidate: ContentTopicFactoryCandidate) => void;
    onCommit: () => void;
}) {
    const patch = (value: Partial<ContentTopicFactoryCandidate>) => onChange({ ...candidate, ...value });
    const textAreaProps = { autoSize: { minRows: 2, maxRows: 6 }, onBlur: onCommit };
    return (
        <div className="space-y-4">
            <EditorField label="选题标题">
                <Input.TextArea {...textAreaProps} value={candidate.title} onChange={(event) => patch({ title: event.target.value })} />
            </EditorField>
            <EditorField label="核心爆点">
                <Input.TextArea {...textAreaProps} value={candidate.core_hook} onChange={(event) => patch({ core_hook: event.target.value })} />
            </EditorField>
            <EditorField label="目标受众">
                <Input.TextArea {...textAreaProps} value={candidate.target_audience.segment} onChange={(event) => patch({ target_audience: { ...candidate.target_audience, segment: event.target.value } })} />
            </EditorField>
            <EditorField label="需求 / 焦虑">
                <Input.TextArea {...textAreaProps} value={candidate.target_audience.need_or_anxiety} onChange={(event) => patch({ target_audience: { ...candidate.target_audience, need_or_anxiety: event.target.value } })} />
            </EditorField>
            <EditorField label="具体场景">
                <Input.TextArea {...textAreaProps} value={candidate.specific_situation} onChange={(event) => patch({ specific_situation: event.target.value })} />
            </EditorField>
            <EditorField label="核心冲突">
                <Input.TextArea {...textAreaProps} value={candidate.core_conflict} onChange={(event) => patch({ core_conflict: event.target.value })} />
            </EditorField>
            <EditorField label="反差 / 转折">
                <Input.TextArea {...textAreaProps} value={candidate.twist_or_gap} onChange={(event) => patch({ twist_or_gap: event.target.value })} />
            </EditorField>
            <EditorField label="收益类型">
                <Select className="w-full" value={candidate.payoff.type} options={payoffOptions} onBlur={onCommit} onChange={(type) => patch({ payoff: { ...candidate.payoff, type } })} />
            </EditorField>
            <EditorField label="内容收益">
                <Input.TextArea {...textAreaProps} value={candidate.payoff.description} onChange={(event) => patch({ payoff: { ...candidate.payoff, description: event.target.value } })} />
            </EditorField>
            <EditorField label="故事承诺">
                <Input.TextArea {...textAreaProps} value={candidate.story_promise} onChange={(event) => patch({ story_promise: event.target.value })} />
            </EditorField>
            <EditorField label="分享动机">
                <Input.TextArea {...textAreaProps} value={candidate.share_motivation} onChange={(event) => patch({ share_motivation: event.target.value })} />
            </EditorField>
            <EditorField label="标签">
                <Input.TextArea
                    {...textAreaProps}
                    value={candidate.tags.join("、")}
                    placeholder="使用逗号或顿号分隔"
                    onChange={(event) => patch({ tags: event.target.value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) })}
                />
            </EditorField>
            <CitationSection values={citations} />
        </div>
    );
}

function TopicCandidateView({ candidate, citations }: { candidate: ContentTopicFactoryCandidate; citations: ContentTopicCitation[] }) {
    return (
        <div className="space-y-5">
            <section>
                <div className="mb-2 text-xs font-medium text-muted-foreground">核心爆点</div>
                <p className="text-base font-medium leading-7">{candidate.core_hook}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{candidate.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
            </section>
            <Descriptions
                size="small"
                column={1}
                items={[
                    { key: "audience", label: "目标受众", children: `${candidate.target_audience.segment} · ${candidate.target_audience.need_or_anxiety}` },
                    { key: "situation", label: "具体场景", children: candidate.specific_situation },
                    { key: "conflict", label: "核心冲突", children: candidate.core_conflict },
                    { key: "twist", label: "反差 / 转折", children: candidate.twist_or_gap },
                    { key: "payoff", label: "内容收益", children: candidate.payoff.description },
                    { key: "promise", label: "故事承诺", children: candidate.story_promise },
                    { key: "share", label: "分享动机", children: candidate.share_motivation },
                    { key: "source", label: "来源", children: <CitationList values={citations} /> },
                ]}
            />
        </div>
    );
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-2 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function CitationSection({ values }: { values: ContentTopicCitation[] }) {
    return (
        <div>
            <div className="mb-2 text-xs text-muted-foreground">来源</div>
            <CitationList values={values} />
        </div>
    );
}

function CitationList({ values }: { values: ContentTopicCitation[] }) {
    if (!values.length) return <span className="text-sm text-muted-foreground">暂无来源</span>;
    return (
        <ul className="space-y-4">
            {values.map((item, index) => (
                <li key={`${item.url}-${index}`}>
                    <a className="block break-all text-sm" href={item.url} target="_blank" rel="noreferrer">
                        {citationLabel(item)}
                    </a>
                </li>
            ))}
        </ul>
    );
}

function citationLabel(citation: ContentTopicCitation) {
    if (citation.title?.trim()) return citation.title.trim();
    try {
        return new URL(citation.url).hostname.replace(/^www\./, "");
    } catch {
        return citation.url;
    }
}

function candidateSignature(candidate: ContentTopicFactoryCandidate) {
    return JSON.stringify(candidate);
}
