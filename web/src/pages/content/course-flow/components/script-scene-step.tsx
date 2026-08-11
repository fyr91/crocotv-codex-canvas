import { Button, Empty, Input, Popconfirm, Skeleton, Tooltip, Upload } from "antd";
import { Check, Images, LoaderCircle, Plus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { Fragment, useState } from "react";

import type { CourseFlowMode, CourseFlowScene, CourseFlowSegment, CourseSceneAspectRatio } from "@/types/course-flow";
import { courseSegmentDividerKey, isCourseScriptConfirmed } from "../segment-actions";
import { useHorizontalRail } from "../use-horizontal-rail";
import { InsertSegmentModal } from "./insert-segment-modal";
import { SegmentRegenerationModal } from "./segment-regeneration-modal";
import { ScriptInputForm, type CourseScriptInput } from "./script-input-modal";

const emptyDividerKeys = new Set<string>();

export function ScriptSceneStep({ sceneMode, segments, scene, scriptGenerating, scriptEnhancing, sceneGenerating, aspectRatio, regeneratingSegmentIds, insertingDividerKeys = emptyDividerKeys, scriptInput, sceneMediaActions, onOpenInput, onEnhance, onSaveSegment, onRegenerateSegment, onConfirmSegment, onDeleteSegment, onInsertSegment, onRegenerateScene, onNext }: {
    sceneMode?: CourseFlowMode | null;
    segments: CourseFlowSegment[];
    scene: CourseFlowScene | null;
    scriptGenerating: boolean;
    scriptEnhancing: boolean;
    sceneGenerating: boolean;
    aspectRatio: CourseSceneAspectRatio;
    regeneratingSegmentIds: ReadonlySet<string>;
    insertingDividerKeys?: ReadonlySet<string>;
    scriptInput?: { ratioOptions: Array<{ label: string; value: CourseSceneAspectRatio }>; onSubmit: (values: CourseScriptInput) => void };
    sceneMediaActions?: { replacing: boolean; onChoose: () => void; onUpload: (file: File) => Promise<boolean> };
    onOpenInput: () => void;
    onEnhance: () => void;
    onSaveSegment: (segmentId: string, patch: { text?: string; voiceDirection?: string }) => void;
    onRegenerateSegment: (segmentId: string, direction: string) => void;
    onConfirmSegment?: (segmentId: string) => void;
    onDeleteSegment?: (segmentId: string) => void;
    onInsertSegment?: (previousSegmentId: string, nextSegmentId: string, instruction: string) => void;
    onRegenerateScene: () => void;
    onNext: () => void;
}) {
    const [segmentRegenerationTarget, setSegmentRegenerationTarget] = useState<string | null>(null);
    const [insertionTarget, setInsertionTarget] = useState<{ previousId: string; nextId: string } | null>(null);
    const usesGreenScreen = sceneMode !== "general" && sceneMode !== null;
    const { railRef, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture } = useHorizontalRail();
    const sceneReplacing = Boolean(sceneMediaActions?.replacing);
    const sceneProgress = sceneReplacing ? "正在保存课程场景…" : sceneGenerating
        ? scene?.status === "running" ? "正在生成课程场景…" : "正在优化场景提示词…"
        : scene?.status === "failed" ? "课程场景生成失败，请重新生成"
        : scene?.assetId ? "课程场景已生成，可以进入音频"
        : scriptGenerating ? "正在准备课程场景…" : "等待生成课程场景";
    const scriptToolbar = (sticky: boolean) => <div className={`${sticky ? "sticky top-0 z-10 border-b" : "mb-3 rounded-xl border"} flex flex-wrap items-center justify-between gap-3 border-border bg-[var(--surface-raised)] px-4 py-3`}>
        <strong>课程文案 · {segments.length} 个片段</strong>
        <Button
            size="small"
            loading={scriptEnhancing}
            disabled={regeneratingSegmentIds.size > 0}
            title={regeneratingSegmentIds.size ? "请等待片段重新生成完成" : undefined}
            onClick={onEnhance}
        >优化文案</Button>
    </div>;
    const segmentEditor = (segment: CourseFlowSegment, regenerating: boolean, horizontal: boolean) => regenerating ? <div role="status" className={`${horizontal ? "min-h-72 flex-1" : "min-h-32 min-w-0 py-2"}`}>
        <p className="mb-3 text-sm font-medium">片段重新生成中</p>
        <Skeleton active title={false} paragraph={{ rows: horizontal ? 8 : 3 }} />
    </div> : <div className="flex min-w-0 flex-1 flex-col">
        <div data-testid="course-segment-fields" className="flex min-w-0 flex-col gap-4">
            <div className="space-y-2">
                <label htmlFor={`course-script-content-${segment.id}`} className="block text-xs font-medium text-muted-foreground">课程内容</label>
                <Input.TextArea id={`course-script-content-${segment.id}`} className={horizontal ? "!overflow-y-auto" : undefined} style={horizontal ? { height: 176, resize: "none" } : undefined} defaultValue={segment.text} autoSize={horizontal ? false : { minRows: 3, maxRows: 8 }} onBlur={(event) => event.target.value !== segment.text && onSaveSegment(segment.id, { text: event.target.value })} />
            </div>
            <div className="space-y-2">
                <label htmlFor={`course-script-voice-${segment.id}`} className="block text-xs font-medium text-muted-foreground">语气指导</label>
                <Input.TextArea id={`course-script-voice-${segment.id}`} className={horizontal ? "!overflow-y-auto" : undefined} style={horizontal ? { height: 80, resize: "none" } : undefined} defaultValue={segment.voiceDirection} autoSize={horizontal ? false : { minRows: 1, maxRows: 3 }} onBlur={(event) => event.target.value !== segment.voiceDirection && onSaveSegment(segment.id, { voiceDirection: event.target.value })} />
            </div>
        </div>
        <div className="mt-auto flex items-center justify-end gap-1 pt-4">
            {isCourseScriptConfirmed(segment) ? <Tooltip title="文案已确认"><span aria-label="文案已确认" className="flex size-8 items-center justify-center text-foreground"><Check className="size-4" /></span></Tooltip> : <Button size="small" onClick={() => onConfirmSegment?.(segment.id)}>确认并生成音频</Button>}
            <Tooltip title="重新生成片段"><Button type="text" size="small" className="!size-8" aria-label="重新生成片段" icon={<RefreshCw className="size-4" />} onClick={() => setSegmentRegenerationTarget(segment.id)} /></Tooltip>
            <Popconfirm title="删除这个片段及其关联内容？" description="将同时删除当前课程内关联的音频、规划、分镜和视频。" okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onDeleteSegment?.(segment.id)}>
                <Tooltip title="删除片段"><Button type="text" danger size="small" className="!size-8" aria-label="删除片段" icon={<Trash2 className="size-4" />} /></Tooltip>
            </Popconfirm>
        </div>
    </div>;
    const scriptFooter = <footer data-testid="course-script-footer" className="mt-4 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-border bg-[var(--surface-raised)] px-4 py-3">
        <div className="min-w-0 flex-1"><span className="block text-sm text-muted-foreground">文案 {segments.length} 个片段</span>{usesGreenScreen ? <span aria-label="课程场景生成进度" aria-live="polite" aria-atomic="true" className="mt-0.5 block truncate text-xs text-muted-foreground">{sceneProgress}</span> : null}</div>
        <Button type="primary" disabled={usesGreenScreen && (sceneReplacing || !scene?.assetId)} onClick={onNext}>进入音频</Button>
    </footer>;

    return (
        <section className={usesGreenScreen ? "mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8" : `flex min-h-0 w-full flex-1 flex-col overflow-hidden py-6 ${segments.length ? "" : "px-4 sm:px-8"}`}>
            <header className={`${!usesGreenScreen && segments.length ? "px-4 sm:px-8" : ""} mb-5 flex flex-wrap items-start justify-between gap-4`}>
                <div><h1 className="text-2xl font-semibold tracking-tight">{usesGreenScreen ? "文案与场景" : "课程文案"}</h1><p className="mt-1 text-sm text-muted-foreground">{usesGreenScreen ? "文案直接按口播语义分段，同时生成统一的绿幕课程场景。" : "课程文案按口播语义分段，确认后即可继续生成音频。"}</p></div>
                {segments.length ? <Button onClick={onOpenInput}>重新填写课程需求</Button> : null}
            </header>
            {scriptGenerating && !segments.length ? <div className={usesGreenScreen ? "grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_0.92fr]" : "mx-auto min-h-0 w-full max-w-5xl flex-1"}>
                <div role="status" aria-label="课程文案生成中" aria-live="polite" className="rounded-2xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)]">
                    <strong className="mb-4 block">课程文案</strong>
                    <p className="mb-4 text-sm text-muted-foreground">正在生成并整理口播片段…</p>
                    <Skeleton active title={false} paragraph={{ rows: 10 }} />
                </div>
                {usesGreenScreen ? <div role="status" aria-label="视觉框架生成中" aria-live="polite" className="rounded-2xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)]">
                    <strong className="mb-4 block">视觉框架 · {aspectRatio}</strong>
                    <p className="mb-4 text-sm text-muted-foreground">正在等待文案完成并生成统一课程场景…</p>
                    <div className="rounded-xl border border-border bg-[var(--surface-sunken)] p-5" style={{ aspectRatio: aspectRatio.replace(":", "/") }}><Skeleton active title={false} paragraph={{ rows: 5 }} /></div>
                </div> : null}
            </div> : !segments.length ? scriptInput ? <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-[var(--surface-raised)] p-5 shadow-[var(--elevation-card)] sm:p-6">
                <ScriptInputForm initialAspectRatio={aspectRatio} projectSceneMode={sceneMode === undefined ? "green_screen" : sceneMode} ratioOptions={scriptInput.ratioOptions} onSubmit={scriptInput.onSubmit} />
            </div> : <Empty className="my-auto" description="课程需求表单暂不可用" /> : <>
                <div data-testid="course-script-content" className={usesGreenScreen ? "grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_0.92fr]" : "min-h-0 flex-1 overflow-y-auto pb-1 thin-scrollbar"}>
                    {usesGreenScreen ? <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-raised)] shadow-[var(--elevation-card)] thin-scrollbar">
                        {scriptToolbar(true)}
                        {scriptEnhancing ? <div role="status" aria-live="polite" className="min-h-56 p-4">
                            <p className="mb-4 text-sm font-medium">课程文案优化中</p>
                            <Skeleton active title={false} paragraph={{ rows: 8 }} />
                        </div> : segments.map((segment, index) => {
                            const regenerating = regeneratingSegmentIds.has(segment.id);
                            const next = segments[index + 1];
                            const dividerKey = next ? courseSegmentDividerKey(segment.id, next.id) : "";
                            return <Fragment key={segment.id}><article aria-busy={regenerating} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr]">
                                <span className="pt-2 text-xs font-medium text-muted-foreground">片段 {String(segment.position + 1).padStart(2, "0")}</span>
                                {segmentEditor(segment, regenerating, false)}
                            </article>{next ? <div className="group relative border-t border-border">
                                <Button type="text" shape="circle" size="small" className="!absolute !left-1/2 !top-1/2 !z-[1] !size-8 !-translate-x-1/2 !-translate-y-1/2 !border !border-border !bg-[var(--surface-raised)] opacity-60 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" aria-label={`在片段 ${String(segment.position + 1).padStart(2, "0")} 和片段 ${String(next.position + 1).padStart(2, "0")} 之间新增片段`} icon={<Plus className="size-4" />} onClick={() => setInsertionTarget({ previousId: segment.id, nextId: next.id })} />
                                {insertingDividerKeys.has(dividerKey) ? <div role="status" aria-label="新增片段生成中" className="grid min-h-36 gap-3 p-4 sm:grid-cols-[72px_1fr]"><span /><Skeleton active title={false} paragraph={{ rows: 3 }} /></div> : null}
                            </div> : null}</Fragment>;
                        })}
                    </div> : <div className="w-full min-w-0">
                        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8">{scriptToolbar(false)}</div>
                        <div className="w-full px-4 sm:px-8">
                        {scriptEnhancing ? <div role="status" aria-live="polite">
                            <p className="mb-3 text-sm font-medium">课程文案优化中</p>
                            <div className="overflow-x-auto overflow-y-hidden pb-3 thin-scrollbar"><div className="flex w-max min-w-full items-stretch gap-3">{segments.map((segment) => <article key={segment.id} className="w-[min(82vw,360px)] shrink-0 rounded-xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)] sm:w-[360px]"><Skeleton active title={false} paragraph={{ rows: 8 }} /></article>)}</div></div>
                        </div> : <div ref={railRef} role="region" aria-label="课程文案片段横向列表" tabIndex={0} className={`touch-pan-y overflow-x-auto overflow-y-hidden pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring thin-scrollbar ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onClickCapture={onClickCapture}>
                            <div className="flex w-max min-w-full items-stretch gap-3">{segments.map((segment, index) => {
                                const regenerating = regeneratingSegmentIds.has(segment.id);
                                const next = segments[index + 1];
                                const dividerKey = next ? courseSegmentDividerKey(segment.id, next.id) : "";
                                const segmentLabel = String(segment.position + 1).padStart(2, "0");
                                return <Fragment key={segment.id}>
                                    <article aria-label={`片段 ${segmentLabel} 课程文案`} aria-busy={regenerating} className="flex w-[min(82vw,360px)] shrink-0 flex-col rounded-xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)] sm:w-[360px]">
                                        <p className="mb-4 border-b border-border pb-3 text-xs font-medium text-muted-foreground">片段 {segmentLabel}</p>
                                        {segmentEditor(segment, regenerating, true)}
                                    </article>
                                    {next ? <div className="flex shrink-0 items-center gap-3">
                                        <Tooltip title={`在片段 ${segmentLabel} 和片段 ${String(next.position + 1).padStart(2, "0")} 之间新增片段`}><Button type="text" shape="circle" size="small" className="!size-8 !border !border-dashed !border-border !bg-transparent !text-muted-foreground hover:!border-solid hover:!bg-[var(--surface-raised)] hover:!text-foreground focus-visible:!border-solid focus-visible:!bg-[var(--surface-raised)] focus-visible:!text-foreground" aria-label={`在片段 ${segmentLabel} 和片段 ${String(next.position + 1).padStart(2, "0")} 之间新增片段`} icon={<Plus className="size-4" />} onClick={() => setInsertionTarget({ previousId: segment.id, nextId: next.id })} /></Tooltip>
                                        {insertingDividerKeys.has(dividerKey) ? <article role="status" aria-label="新增片段生成中" className="w-[min(82vw,360px)] shrink-0 rounded-xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)] sm:w-[360px]"><Skeleton active title={false} paragraph={{ rows: 8 }} /></article> : null}
                                    </div> : null}
                                </Fragment>;
                            })}</div>
                        </div>}
                        </div>
                    </div>}
                    {usesGreenScreen ? <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)] thin-scrollbar">
                        <div className="mb-3 flex items-center justify-between"><strong>课程场景 · {aspectRatio}</strong><Button icon={<RefreshCw className="size-4" />} loading={sceneGenerating} disabled={sceneReplacing} onClick={onRegenerateScene}>重新生成场景</Button></div>
                        <div aria-busy={sceneReplacing} className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30" style={{ aspectRatio: aspectRatio.replace(":", "/") }}>
                            {sceneMediaActions ? <div className="absolute right-2 top-2 z-20 flex gap-1 rounded-lg border border-border bg-[var(--surface-overlay)]/90 p-1 shadow-[var(--elevation-popover)]">
                                <Button type="text" shape="circle" disabled={sceneGenerating || sceneReplacing} aria-label="从素材库选择课程场景" title="从素材库选择课程场景" icon={<Images className="size-4" />} onClick={sceneMediaActions.onChoose} />
                                <Upload accept="image/*" maxCount={1} disabled={sceneGenerating || sceneReplacing} showUploadList={false} beforeUpload={(file) => sceneMediaActions.onUpload(file)}>
                                    <Button type="text" shape="circle" disabled={sceneGenerating || sceneReplacing} aria-label="上传课程场景" title="上传课程场景" icon={<UploadCloud className="size-4" />} />
                                </Upload>
                            </div> : null}
                            {sceneGenerating ? <div data-testid="course-scene-loading" aria-hidden="true" className="flex size-full flex-col items-center justify-center gap-3 bg-[var(--surface-sunken)] text-muted-foreground">
                                <LoaderCircle className="size-7 animate-spin motion-reduce:animate-none" />
                                <span className="text-xs">{sceneProgress}</span>
                            </div> : scene?.url ? <img src={scene.url} alt="绿幕课程场景" className="size-full object-cover" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scene?.errorMessage || "场景尚未生成"} />}
                            {sceneReplacing ? <div role="status" aria-label="课程场景保存中" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--surface-overlay)]/75 text-sm text-muted-foreground">
                                <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" />
                                <span>正在保存课程场景…</span>
                            </div> : null}
                        </div>
                    </div> : null}
                </div>
                {usesGreenScreen ? scriptFooter : <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8">{scriptFooter}</div>}
            </>}
            <SegmentRegenerationModal
                open={Boolean(segmentRegenerationTarget)}
                onClose={() => setSegmentRegenerationTarget(null)}
                onSubmit={(direction) => {
                    const segmentId = segmentRegenerationTarget;
                    setSegmentRegenerationTarget(null);
                    if (segmentId) onRegenerateSegment(segmentId, direction);
                }}
            />
            <InsertSegmentModal open={Boolean(insertionTarget)} onClose={() => setInsertionTarget(null)} onSubmit={(instruction) => {
                const target = insertionTarget;
                setInsertionTarget(null);
                if (target) onInsertSegment?.(target.previousId, target.nextId, instruction);
            }} />
        </section>
    );
}
