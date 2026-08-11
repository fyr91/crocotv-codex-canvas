import { Alert, App, Button, Collapse, Input, Progress, Tag } from "antd";
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CanvasNodeReasoningBox } from "@/components/canvas/canvas-node-reasoning-box";
import {
    contentStorylineSnapshot,
    createStorylineSaveQueue,
    storylineCandidatePatch,
    validateContentStorylineCandidate,
} from "@/lib/content-production/storyline";
import type { GenerationJob } from "@/services/api/generation-client";
import type {
    ContentNode,
    ContentStorylineCandidate,
    ContentStorylineReviewDimension,
} from "@/types/content-production";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./content-node-panel-tabs";

const phaseLabels = {
    producer_running: "生成中",
    reviewer_running: "审核中",
    repairing: "调整中",
    accepted: "已通过",
    needs_owner_attention: "需要处理",
    failed: "失败",
} as const;

const dimensionLabels: Record<string, string> = {
    opening_hook: "前三秒 Hook",
    narrative_tension: "爆点与叙事张力",
    emotional_payoff: "情绪曲线与爽点",
    cta_naturalness: "CTA_Bridge",
    executability: "落地性与零占位符",
};

export function StorylineDetails({
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
    onContinue: (node?: ContentNode) => Promise<void>;
    panelTab?: ContentNodePanelTab;
    tuningEnabled?: boolean;
    tuning?: ReactNode;
    onPanelTabChange?: (tab: ContentNodePanelTab) => void;
}) {
    const { message } = App.useApp();
    const snapshot = contentStorylineSnapshot(node);
    const candidate = snapshot?.candidate || null;
    const [draft, setDraft] = useState(candidate);
    const activeNodeIdRef = useRef(node.id);
    const latestNodeRef = useRef(node);
    const draftRef = useRef(candidate);
    const savedSignatureRef = useRef(candidate ? JSON.stringify(candidate) : "");
    const queuedSignatureRef = useRef(savedSignatureRef.current);
    const queueRef = useRef(createStorylineSaveQueue(async (nextCandidate) => {
        const sourceNode = latestNodeRef.current;
        const updated = await onSave(storylineCandidatePatch(sourceNode, nextCandidate), sourceNode);
        latestNodeRef.current = updated;
    }));
    const incomingSignature = candidate ? JSON.stringify(candidate) : "";

    useEffect(() => {
        latestNodeRef.current = node;
        if (activeNodeIdRef.current !== node.id) {
            activeNodeIdRef.current = node.id;
            draftRef.current = candidate;
            setDraft(candidate);
            savedSignatureRef.current = incomingSignature;
            queuedSignatureRef.current = incomingSignature;
            queueRef.current = createStorylineSaveQueue(async (nextCandidate) => {
                const sourceNode = latestNodeRef.current;
                const updated = await onSave(storylineCandidatePatch(sourceNode, nextCandidate), sourceNode);
                latestNodeRef.current = updated;
            });
            return;
        }
        const draftSignature = draftRef.current ? JSON.stringify(draftRef.current) : "";
        const previousSaved = savedSignatureRef.current;
        if (incomingSignature === queuedSignatureRef.current) savedSignatureRef.current = incomingSignature;
        if (draftSignature === previousSaved) {
            draftRef.current = candidate;
            setDraft(candidate);
            savedSignatureRef.current = incomingSignature;
            queuedSignatureRef.current = incomingSignature;
        }
    }, [candidate, incomingSignature, node, onSave]);

    if (!snapshot) return null;

    const currentJob = jobs.find((job) => ["queued", "running"].includes(job.status)) || jobs.at(-1);
    const running = ["producer_running", "reviewer_running", "repairing"].includes(snapshot.phase);
    const canEdit = editable && !running && Boolean(draft);
    const validationIssues = validateContentStorylineCandidate(draft);
    const canContinue = editable
        && snapshot.phase === "accepted"
        && snapshot.review?.verdict === "pass"
        && validationIssues.length === 0;

    const updateDraft = (next: ContentStorylineCandidate) => {
        draftRef.current = next;
        setDraft(next);
    };
    const persistDraft = async () => {
        const next = draftRef.current;
        if (!next) return;
        const signature = JSON.stringify(next);
        if (signature === savedSignatureRef.current || signature === queuedSignatureRef.current) return;
        queuedSignatureRef.current = signature;
        try {
            await queueRef.current.enqueue(next);
            savedSignatureRef.current = signature;
        } catch (error) {
            if (queuedSignatureRef.current === signature) queuedSignatureRef.current = savedSignatureRef.current;
            message.error(error instanceof Error ? error.message : "故事线自动保存失败");
        }
    };
    const continueWithSavedDraft = async () => {
        await persistDraft();
        await queueRef.current.flush();
        await onContinue(latestNodeRef.current);
    };

    const contentPanel = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">故事线 V2 · {operationLabel(snapshot.operation)}</div>
                        <h2 className="mt-1 truncate font-semibold">{draft?.positioning.core_narrative_anchor || node.title}</h2>
                    </div>
                    <Tag color={snapshot.phase === "accepted" ? "green" : snapshot.phase === "failed" ? "red" : snapshot.phase === "needs_owner_attention" ? "orange" : "blue"}>
                        {phaseLabels[snapshot.phase]}
                    </Tag>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5" data-canvas-scroll>
                {currentJob && running ? (
                    <div className="mb-5">
                        <CanvasNodeReasoningBox
                            text={currentJob.reasoning_text || ""}
                            running={["queued", "running"].includes(currentJob.status)}
                            runningLabel={snapshot.phase === "reviewer_running" ? "审核中" : snapshot.phase === "repairing" ? "调整中" : "生成中"}
                            completeLabel={snapshot.phase === "reviewer_running" ? "审核过程" : "思考过程"}
                        />
                    </div>
                ) : null}
                {snapshot.lastError ? <Alert className="mb-5" type="error" showIcon message={snapshot.lastError} /> : null}
                {validationIssues.length && draft ? (
                    <Alert className="mb-5" type="warning" showIcon message="故事线结构尚不完整" description={validationIssues.join("；")} />
                ) : null}

                {draft ? (
                    <StorylineEditor
                        candidate={draft}
                        editable={canEdit}
                        onChange={updateDraft}
                        onCommit={() => void persistDraft()}
                    />
                ) : (
                    <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                        {running ? "故事线结构生成后会显示在这里。" : "当前没有可展示的故事线内容。"}
                    </div>
                )}

                {snapshot.review ? (
                    <ReviewCard review={snapshot.review} round={snapshot.round} />
                ) : null}
            </div>

            <div className="space-y-2 border-t border-border p-4">
                <Button
                    type="primary"
                    block
                    icon={<ArrowRight className="size-4" />}
                    disabled={!canContinue}
                    loading={generating}
                    onClick={() => void continueWithSavedDraft()}
                >
                    生成镜头
                </Button>
                {!canContinue && draft ? (
                    <p className="text-center text-xs text-muted-foreground">故事线通过审核且结构完整后可继续</p>
                ) : null}
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

function StorylineEditor({
    candidate,
    editable,
    onChange,
    onCommit,
}: {
    candidate: ContentStorylineCandidate;
    editable: boolean;
    onChange: (candidate: ContentStorylineCandidate) => void;
    onCommit: () => void;
}) {
    const updatePositioning = (patch: Partial<ContentStorylineCandidate["positioning"]>) => {
        onChange({ ...candidate, positioning: { ...candidate.positioning, ...patch } });
    };
    const updateAct = <K extends keyof ContentStorylineCandidate["five_act"]>(
        key: K,
        value: ContentStorylineCandidate["five_act"][K],
    ) => onChange({ ...candidate, five_act: { ...candidate.five_act, [key]: value } });
    const fieldProps = { disabled: !editable, autoSize: { minRows: 2, maxRows: 6 }, onBlur: onCommit };

    return (
        <Collapse
            ghost
            defaultActiveKey={["positioning", "beats", "setup", "escalation", "reveal", "payoff", "cta"]}
            items={[
                {
                    key: "positioning",
                    label: "1. 故事线定位",
                    children: (
                        <div className="space-y-4">
                            <EditorField label="核心爆点">
                                <Input.TextArea {...fieldProps} value={candidate.positioning.core_narrative_anchor} onChange={(event) => updatePositioning({ core_narrative_anchor: event.target.value })} />
                            </EditorField>
                            <EditorField label="情绪价值">
                                <Input.TextArea {...fieldProps} value={candidate.positioning.emotional_value} onChange={(event) => updatePositioning({ emotional_value: event.target.value })} />
                            </EditorField>
                            <EditorField label="情绪曲线（用 → 分隔）">
                                <Input.TextArea
                                    {...fieldProps}
                                    value={candidate.positioning.emotional_curve.join(" → ")}
                                    onChange={(event) => updatePositioning({ emotional_curve: splitCurve(event.target.value) })}
                                />
                            </EditorField>
                        </div>
                    ),
                },
                {
                    key: "beats",
                    label: "前三秒视觉节拍",
                    children: (
                        <RepeatableSection
                            editable={editable}
                            addLabel="添加视觉节拍"
                            items={candidate.positioning.opening_visual_beats}
                            onChange={(items) => updatePositioning({ opening_visual_beats: items.map((item, index) => ({ ...item, order: index + 1 })) })}
                            onCommit={onCommit}
                            createItem={(order) => ({ order, visual_concept: "", narrative_function: "" })}
                            renderItem={(item, update) => (
                                <>
                                    <EditorField label="动态 / 反差画面概念">
                                        <Input.TextArea {...fieldProps} value={item.visual_concept} onChange={(event) => update({ ...item, visual_concept: event.target.value })} />
                                    </EditorField>
                                    <EditorField label="叙事功能">
                                        <Input.TextArea {...fieldProps} value={item.narrative_function} onChange={(event) => update({ ...item, narrative_function: event.target.value })} />
                                    </EditorField>
                                </>
                            )}
                        />
                    ),
                },
                {
                    key: "setup",
                    label: "Setup（起）",
                    children: (
                        <div className="space-y-4">
                            <EditorField label="核心冲突"><Input.TextArea {...fieldProps} value={candidate.five_act.setup.conflict} onChange={(event) => updateAct("setup", { ...candidate.five_act.setup, conflict: event.target.value })} /></EditorField>
                            <EditorField label="角色动作"><Input.TextArea {...fieldProps} value={candidate.five_act.setup.character_action} onChange={(event) => updateAct("setup", { ...candidate.five_act.setup, character_action: event.target.value })} /></EditorField>
                            <EditorField label="核心悬念"><Input.TextArea {...fieldProps} value={candidate.five_act.setup.suspense} onChange={(event) => updateAct("setup", { ...candidate.five_act.setup, suspense: event.target.value })} /></EditorField>
                        </div>
                    ),
                },
                {
                    key: "escalation",
                    label: "Escalation（承）",
                    children: (
                        <div className="space-y-4">
                            <RepeatableSection
                                editable={editable}
                                addLabel="添加压力层"
                                items={candidate.five_act.escalation.layers}
                                onChange={(layers) => updateAct("escalation", { ...candidate.five_act.escalation, layers: layers.map((item, index) => ({ ...item, order: index + 1 })) })}
                                onCommit={onCommit}
                                createItem={(order) => ({ order, pressure: "", character_action: "", consequence: "" })}
                                renderItem={(item, update) => (
                                    <>
                                        <EditorField label="压力 / 障碍"><Input.TextArea {...fieldProps} value={item.pressure} onChange={(event) => update({ ...item, pressure: event.target.value })} /></EditorField>
                                        <EditorField label="角色动作"><Input.TextArea {...fieldProps} value={item.character_action} onChange={(event) => update({ ...item, character_action: event.target.value })} /></EditorField>
                                        <EditorField label="后果"><Input.TextArea {...fieldProps} value={item.consequence} onChange={(event) => update({ ...item, consequence: event.target.value })} /></EditorField>
                                    </>
                                )}
                            />
                            <EditorField label="即将失控点"><Input.TextArea {...fieldProps} value={candidate.five_act.escalation.loss_of_control_point} onChange={(event) => updateAct("escalation", { ...candidate.five_act.escalation, loss_of_control_point: event.target.value })} /></EditorField>
                        </div>
                    ),
                },
                {
                    key: "reveal",
                    label: "Reveal（转）",
                    children: (
                        <div className="space-y-4">
                            <EditorField label="真相 / 解法"><Input.TextArea {...fieldProps} value={candidate.five_act.reveal.truth_or_solution} onChange={(event) => updateAct("reveal", { ...candidate.five_act.reveal, truth_or_solution: event.target.value })} /></EditorField>
                            <EditorField label="意外但合理"><Input.TextArea {...fieldProps} value={candidate.five_act.reveal.unexpected_but_inevitable} onChange={(event) => updateAct("reveal", { ...candidate.five_act.reveal, unexpected_but_inevitable: event.target.value })} /></EditorField>
                            <EditorField label="与爆点的关系"><Input.TextArea {...fieldProps} value={candidate.five_act.reveal.anchor_connection} onChange={(event) => updateAct("reveal", { ...candidate.five_act.reveal, anchor_connection: event.target.value })} /></EditorField>
                        </div>
                    ),
                },
                {
                    key: "payoff",
                    label: "Payoff（合）",
                    children: (
                        <div className="space-y-4">
                            <EditorField label="直接结果"><Input.TextArea {...fieldProps} value={candidate.five_act.payoff.direct_result} onChange={(event) => updateAct("payoff", { ...candidate.five_act.payoff, direct_result: event.target.value })} /></EditorField>
                            <EditorField label="情绪释放"><Input.TextArea {...fieldProps} value={candidate.five_act.payoff.emotional_release} onChange={(event) => updateAct("payoff", { ...candidate.five_act.payoff, emotional_release: event.target.value })} /></EditorField>
                            <EditorField label="观众价值"><Input.TextArea {...fieldProps} value={candidate.five_act.payoff.audience_value} onChange={(event) => updateAct("payoff", { ...candidate.five_act.payoff, audience_value: event.target.value })} /></EditorField>
                        </div>
                    ),
                },
                {
                    key: "cta",
                    label: "CTA_Bridge（引导）",
                    children: (
                        <div className="space-y-4">
                            <EditorField label="自然过渡"><Input.TextArea {...fieldProps} value={candidate.five_act.cta_bridge.transition} onChange={(event) => updateAct("cta_bridge", { ...candidate.five_act.cta_bridge, transition: event.target.value })} /></EditorField>
                            <EditorField label="目标行为"><Input.TextArea {...fieldProps} value={candidate.five_act.cta_bridge.target_action} onChange={(event) => updateAct("cta_bridge", { ...candidate.five_act.cta_bridge, target_action: event.target.value })} /></EditorField>
                            <EditorField label="行动动机"><Input.TextArea {...fieldProps} value={candidate.five_act.cta_bridge.motivation} onChange={(event) => updateAct("cta_bridge", { ...candidate.five_act.cta_bridge, motivation: event.target.value })} /></EditorField>
                        </div>
                    ),
                },
            ]}
        />
    );
}

function RepeatableSection<T>({
    items,
    editable,
    addLabel,
    onChange,
    onCommit,
    createItem,
    renderItem,
}: {
    items: T[];
    editable: boolean;
    addLabel: string;
    onChange: (items: T[]) => void;
    onCommit: () => void;
    createItem: (order: number) => T;
    renderItem: (item: T, update: (item: T) => void) => React.ReactNode;
}) {
    const replace = (index: number, item: T) => onChange(items.map((current, currentIndex) => currentIndex === index ? item : current));
    const move = (index: number, offset: number) => {
        const target = index + offset;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
        queueMicrotask(onCommit);
    };
    const remove = (index: number) => {
        onChange(items.filter((_, currentIndex) => currentIndex !== index));
        queueMicrotask(onCommit);
    };
    const add = () => {
        onChange([...items, createItem(items.length + 1)]);
        queueMicrotask(onCommit);
    };
    return (
        <div className="space-y-3">
            {items.map((item, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">节拍 {index + 1}</span>
                        {editable ? (
                            <div className="flex gap-1">
                                <Button type="text" size="small" aria-label="上移" icon={<ArrowUp className="size-3.5" />} disabled={index === 0} onClick={() => move(index, -1)} />
                                <Button type="text" size="small" aria-label="下移" icon={<ArrowDown className="size-3.5" />} disabled={index === items.length - 1} onClick={() => move(index, 1)} />
                                <Button type="text" danger size="small" aria-label="删除" icon={<Trash2 className="size-3.5" />} onClick={() => remove(index)} />
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-3">{renderItem(item, (next) => replace(index, next))}</div>
                </div>
            ))}
            {editable ? <Button block icon={<Plus className="size-4" />} onClick={add}>{addLabel}</Button> : null}
        </div>
    );
}

function ReviewCard({
    review,
    round,
}: {
    review: NonNullable<ReturnType<typeof contentStorylineSnapshot>>["review"];
    round: number;
}) {
    if (!review) return null;
    return (
        <section className="mt-6 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
                <CheckCircle2 className={`size-5 ${review.verdict === "pass" ? "text-primary" : "text-destructive"}`} />
                <div className="font-medium">GLM 审核 · 第 {round} 轮</div>
                <div className="ml-auto text-lg font-semibold">{review.total_score}</div>
            </div>
            <Progress percent={review.total_score} showInfo={false} status={review.verdict === "pass" ? "success" : "exception"} />
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.core_assessment}</p>
            {review.blocking_issues.length ? <Alert className="mt-3" type="warning" showIcon message="阻断问题" description={review.blocking_issues.join("；")} /> : null}
            <div className="mt-4 space-y-3">
                {Object.entries(review.dimension_scores).map(([key, dimension]) => (
                    <ReviewDimension key={key} label={dimensionLabels[key] || key} value={dimension} />
                ))}
            </div>
            {review.revision_instructions.length ? (
                <Collapse
                    className="mt-3"
                    ghost
                    items={[{
                        key: "instructions",
                        label: `针对性修改指导（${review.revision_instructions.length}）`,
                        children: review.revision_instructions.map((instruction, index) => (
                            <div key={`${instruction.target_path}-${index}`} className="mb-3 rounded-lg bg-muted p-3 text-xs leading-5">
                                <div className="font-medium">{instruction.target_path}</div>
                                <div className="mt-1 text-muted-foreground">{instruction.problem} → {instruction.instruction}</div>
                                <div className="mt-1">示范：{instruction.example}</div>
                            </div>
                        )),
                    }]}
                />
            ) : null}
        </section>
    );
}

function ReviewDimension({ label, value }: { label: string; value: ContentStorylineReviewDimension }) {
    return (
        <div className="text-xs">
            <div className="flex justify-between gap-2"><span>{label}</span><span className="font-medium">{value.score}</span></div>
            {value.issues.length ? <div className="mt-1 text-muted-foreground">{value.issues.join("；")}</div> : null}
        </div>
    );
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-2 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function splitCurve(value: string) {
    return value.split(/(?:→|->|,|，|、)/).map((item) => item.trim()).filter(Boolean);
}

function operationLabel(operation: "generate" | "optimize" | "rebuild") {
    return operation === "optimize" ? "优化" : operation === "rebuild" ? "重构" : "初次生成";
}
