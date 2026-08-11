import { useQuery } from "@tanstack/react-query";
import { App, Button, Input, Modal, Result, Skeleton, Tooltip } from "antd";
import { ArrowLeft, Download, Eye, Pause, Play, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { WorkspacePage } from "@/components/layout/page-shell";
import { createContentFactoryExport } from "@/lib/content-factory/export";
import { clampPlayhead, isTimelineShortcutTarget, sectionAtTime, timelineSections } from "@/lib/content-factory/timeline";
import { getCloudAsset } from "@/services/api/cloud-assets";
import { deleteFactorySection, getContentFactorySnapshot, insertFactorySection, regenerateFactoryArtifact, regenerateFactoryScript, requestContentFactoryExport, saveFactoryTextVersion, selectFactoryArtifactVersion, startContentFactoryAutomation } from "@/services/api/content-factory";
import { useContentFactoryStore } from "@/stores/content-factory";
import type { FactoryArtifactVersion, FactoryLayer, FactorySection } from "@/types/content-factory";
import { TimelineEditor } from "./components/timeline-editor";
import { TextVersionModal } from "./components/text-version-modal";

export default function ContentFactoryProjectPage() {
    const { projectId = "" } = useParams();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const hydrate = useContentFactoryStore((state) => state.hydrate);
    const storeSnapshot = useContentFactoryStore((state) => state.snapshot);
    const query = useQuery({ queryKey: ["content-factory", projectId], queryFn: () => getContentFactorySnapshot(projectId), enabled: Boolean(projectId), refetchInterval: (current) => ["automating", "exporting"].includes(current.state.data?.project.status || "") ? 3_000 : false });
    useEffect(() => { if (query.data) hydrate(query.data); }, [hydrate, query.data]);
    const snapshot = storeSnapshot?.project.id === projectId ? storeSnapshot : query.data;
    const [playheadMs, setPlayheadMs] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [textTarget, setTextTarget] = useState<{ section: FactorySection; layer: "script" | "visual_prompt" } | null>(null);
    const [savingText, setSavingText] = useState(false);
    const [insertPosition, setInsertPosition] = useState<number | null>(null);
    const [insertText, setInsertText] = useState("");
    const [exportingZip, setExportingZip] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const layout = useMemo(() => timelineSections((snapshot?.sections || []).map((section) => ({ id: section.id, durationMs: selected(section, "audio")?.durationMs || selected(section, "video")?.durationMs || 5_000 }))), [snapshot?.sections]);
    const activeLayout = sectionAtTime(layout, playheadMs) || layout[0] || null;
    const activeSection = snapshot?.sections.find((section) => section.id === activeLayout?.id) || null;
    const activeVideo = activeSection ? selected(activeSection, "video") : null;
    const activeImage = activeSection ? selected(activeSection, "image") : null;
    const activeAudio = activeSection ? selected(activeSection, "audio") : null;
    const seek = useCallback((value: number) => { setPlaying(false); setPlayheadMs(clampPlayhead(value, layout)); }, [layout]);

    useEffect(() => {
        if (playing || !activeLayout) return;
        const seconds = Math.max(0, (playheadMs - activeLayout.startMs) / 1000);
        if (videoRef.current && Math.abs(videoRef.current.currentTime - seconds) > 0.2) videoRef.current.currentTime = seconds;
        if (audioRef.current && Math.abs(audioRef.current.currentTime - seconds) > 0.2) audioRef.current.currentTime = seconds;
    }, [activeLayout, activeVideo?.id, activeAudio?.id, playheadMs, playing]);
    useEffect(() => {
        if (!playing) { videoRef.current?.pause(); audioRef.current?.pause(); return; }
        const offset = activeLayout ? Math.max(0, (playheadMs - activeLayout.startMs) / 1000) : 0;
        if (videoRef.current) { videoRef.current.currentTime = offset; void videoRef.current.play().catch(() => undefined); }
        if (audioRef.current) { audioRef.current.currentTime = offset; void audioRef.current.play().catch(() => undefined); }
    }, [activeLayout?.id, activeAudio?.id, activeVideo?.id, playing]);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.code !== "Space" || isTimelineShortcutTarget(event.target)) return;
            event.preventDefault();
            setPlaying((value) => !value);
        };
        window.addEventListener("keydown", keydown);
        return () => window.removeEventListener("keydown", keydown);
    }, []);

    const refresh = useCallback(async () => { const result = await query.refetch(); if (result.data) hydrate(result.data); }, [hydrate, query]);
    const regenerate = async (section: FactorySection, layer: FactoryLayer) => {
        const before = useContentFactoryStore.getState().snapshot;
        const optimistic = pendingArtifact(layer, section.artifacts[layer]);
        useContentFactoryStore.getState().addVersion(section.id, optimistic);
        try {
            if (layer === "script") await regenerateFactoryScript(projectId, section.id);
            else {
                const sourceLayer = ({ audio: "script", visual_prompt: "audio", image: "visual_prompt", video: "image" } as const)[layer];
                const source = selected(section, sourceLayer);
                if (!source || source.id.startsWith("draft:")) throw new Error("请先完成并确认下层内容");
                await regenerateFactoryArtifact(projectId, section.id, layer, source.id);
            }
            await refresh();
        } catch (error) {
            if (before) useContentFactoryStore.getState().restore(before);
            message.error(error instanceof Error ? error.message : "重新生成失败");
        }
    };
    const selectVersion = async (section: FactorySection, layer: FactoryLayer, id: string) => {
        const before = useContentFactoryStore.getState().snapshot;
        useContentFactoryStore.getState().selectVersion(section.id, layer, id);
        try { await selectFactoryArtifactVersion(id); await refresh(); } catch (error) { if (before) useContentFactoryStore.getState().restore(before); message.error(error instanceof Error ? error.message : "版本切换失败"); }
    };
    const saveText = async (text: string) => {
        if (!textTarget) return;
        const before = useContentFactoryStore.getState().snapshot;
        const optimistic: FactoryArtifactVersion = { ...pendingArtifact(textTarget.layer, textTarget.section.artifacts[textTarget.layer]), status: "ready", text };
        const source = textTarget.layer === "visual_prompt" ? selected(textTarget.section, "audio")?.id : null;
        useContentFactoryStore.getState().addVersion(textTarget.section.id, optimistic);
        setTextTarget(null);
        setSavingText(true);
        try { await saveFactoryTextVersion(projectId, textTarget.section.id, textTarget.layer, text, source); await refresh(); message.success("已保存新版本"); }
        catch (error) { if (before) useContentFactoryStore.getState().restore(before); message.error(error instanceof Error ? error.message : "内容保存失败"); }
        finally { setSavingText(false); }
    };
    const remove = (section: FactorySection) => modal.confirm({ title: `删除 Section ${section.position + 1}？`, content: "该 Section 的全部版本和生成结果将一并删除。", okText: "删除 Section", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { const before = useContentFactoryStore.getState().snapshot; useContentFactoryStore.getState().removeSection(section.id); try { await deleteFactorySection(projectId, section.id); await refresh(); } catch (error) { if (before) useContentFactoryStore.getState().restore(before); message.error(error instanceof Error ? error.message : "Section 删除失败"); } } });
    const insert = async () => {
        if (insertPosition == null || !insertText.trim()) return;
        const before = useContentFactoryStore.getState().snapshot;
        const position = insertPosition;
        const text = insertText.trim();
        const temporaryId = `pending:${crypto.randomUUID()}`;
        const empty = { audio: [], visual_prompt: [], image: [], video: [] };
        useContentFactoryStore.getState().insertSection(position, { id: temporaryId, position, artifacts: { ...empty, script: [{ ...pendingArtifact("script", []), status: "ready", text }] } });
        setInsertPosition(null); setInsertText("");
        try { await insertFactorySection(projectId, position, text); await refresh(); message.success("Section 已添加"); }
        catch (error) { if (before) useContentFactoryStore.getState().restore(before); message.error(error instanceof Error ? error.message : "Section 添加失败"); }
    };
    const primaryAction = async () => {
        if (!snapshot) return;
        try {
            if (snapshot.project.status === "draft") { useContentFactoryStore.getState().patchProject({ status: "automating", currentStage: "audio" }); await startContentFactoryAutomation(projectId); message.success("已确认文案，后续内容开始自动生成"); }
            else if (["ready", "failed"].includes(snapshot.project.status)) { useContentFactoryStore.getState().patchProject({ status: "exporting", currentStage: "export" }); await requestContentFactoryExport(projectId); message.success(snapshot.project.status === "failed" ? "正在重试合成与导出" : "已确认，正在合成并导出"); }
            await refresh();
        } catch (error) { await refresh(); message.error(error instanceof Error ? error.message : "操作失败"); }
    };
    const download = async () => {
        if (!snapshot?.project.finalAssetId) return;
        setExportingZip(true);
        try { const zip = await createContentFactoryExport(snapshot, async (id) => { const asset = await getCloudAsset(id); if (!asset.url) throw new Error("导出素材不可用"); return (await fetch(asset.url)).blob(); }); saveAs(zip, `${snapshot.project.title}.zip`); }
        catch (error) { message.error(error instanceof Error ? error.message : "导出包下载失败"); }
        finally { setExportingZip(false); }
    };

    if (query.isError) return <Result status="error" title="内容工厂项目无法打开" subTitle={query.error instanceof Error ? query.error.message : "项目读取失败"} extra={<Button onClick={() => void query.refetch()}>重新加载</Button>} />;
    if (query.isLoading || !snapshot) return <WorkspacePage><div className="m-auto w-full max-w-6xl p-8"><Skeleton active paragraph={{ rows: 12 }} /></div></WorkspacePage>;
    const topBar = <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-[var(--surface-raised)] px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><Button type="text" aria-label="返回内容工厂实验室" icon={<ArrowLeft className="size-5" />} onClick={() => navigate("/content-factory")} /><strong className="truncate">内容工厂实验室 · {snapshot.project.title}</strong><span className="hidden text-xs text-muted-foreground sm:inline">已自动保存</span></div><div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground lg:inline">{briefStatus(snapshot.project.status, snapshot.sections)}</span>{snapshot.project.status === "completed" ? <Button icon={<Download className="size-4" />} loading={exportingZip} onClick={() => void download()}>下载全部内容</Button> : <Button type="primary" loading={["automating", "exporting"].includes(snapshot.project.status)} disabled={!['draft', 'ready', 'failed'].includes(snapshot.project.status)} onClick={() => void primaryAction()}>{snapshot.project.status === "draft" ? "确认文案并开始生成" : snapshot.project.status === "ready" ? "确认并导出" : snapshot.project.status === "failed" ? "重试导出" : snapshot.project.status === "exporting" ? "正在导出" : "请处理待生成内容"}</Button>}</div></header>;
    return (
        <WorkspacePage topBar={topBar}>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                <section className="mx-auto flex min-h-48 w-full max-w-5xl flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-black/95 sm:min-h-64">
                    {activeVideo?.url ? <video ref={videoRef} key={activeVideo.id} src={activeVideo.url} muted playsInline preload="metadata" className="h-full max-h-[42vh] w-full object-contain" onTimeUpdate={(event) => { if (playing && activeLayout) setPlayheadMs(clampPlayhead(activeLayout.startMs + event.currentTarget.currentTime * 1000, layout)); }} onEnded={() => { if (!activeLayout) return; const next = layout.find((item) => item.startMs >= activeLayout.endMs); if (next) setPlayheadMs(next.startMs); else setPlaying(false); }} /> : activeImage?.url ? <img src={activeImage.url} alt="当前时间点分镜预览" className="h-full max-h-[42vh] w-full object-contain" /> : <div className="text-center text-sm text-white/60"><Eye className="mx-auto mb-2 size-6" />当前时间点的画面尚未生成</div>}
                    {activeAudio?.url ? <audio ref={audioRef} key={activeAudio.id} src={activeAudio.url} preload="metadata" onTimeUpdate={(event) => { if (playing && !activeVideo?.url && activeLayout) setPlayheadMs(clampPlayhead(activeLayout.startMs + event.currentTarget.currentTime * 1000, layout)); }} onEnded={() => { if (activeVideo?.url || !activeLayout) return; const next = layout.find((item) => item.startMs >= activeLayout.endMs); if (next) setPlayheadMs(next.startMs); else setPlaying(false); }} /> : null}
                </section>
                <div className="mx-auto flex w-full max-w-5xl items-center gap-3 rounded-xl border border-border bg-[var(--surface-raised)] px-4 py-2"><Tooltip title={playing ? "暂停（空格）" : "播放（空格）"}><Button shape="circle" aria-label={playing ? "暂停" : "播放"} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying((value) => !value)} /></Tooltip><span className="w-24 text-xs tabular-nums">{formatTime(playheadMs)} / {formatTime(layout.at(-1)?.endMs || 0)}</span><input aria-label="预览时间点" type="range" min="0" max={layout.at(-1)?.endMs || 0} value={playheadMs} onChange={(event) => seek(Number(event.target.value))} className="min-w-0 flex-1 accent-foreground" /></div>
                <TimelineEditor sections={snapshot.sections} playheadMs={playheadMs} onSeek={seek} onDelete={remove} onInsert={(position) => setInsertPosition(position)} onEdit={(section, layer) => setTextTarget({ section, layer })} onRegenerate={(section, layer) => void regenerate(section, layer)} onSelectVersion={(section, layer, id) => void selectVersion(section, layer, id)} />
            </div>
            <TextVersionModal open={Boolean(textTarget)} layer={textTarget?.layer || "script"} sectionLabel={`Section ${(textTarget?.section.position || 0) + 1}`} initialValue={textTarget ? selected(textTarget.section, textTarget.layer)?.text || "" : ""} saving={savingText} onClose={() => setTextTarget(null)} onSave={(value) => void saveText(value)} />
            <Modal open={insertPosition != null} title="添加 Section" okText="添加 Section" cancelText="取消" onCancel={() => { setInsertPosition(null); setInsertText(""); }} onOk={() => void insert()} okButtonProps={{ disabled: !insertText.trim() }}><p className="mb-3 text-sm text-muted-foreground">新 Section 会从文案开始，保存后可逐层生成音频、提示词、画面和视频。</p><Input.TextArea rows={7} value={insertText} onChange={(event) => setInsertText(event.target.value)} placeholder="输入新 Section 的文案" autoFocus /></Modal>
        </WorkspacePage>
    );
}

function selected(section: FactorySection, layer: FactoryLayer) { return section.artifacts[layer].find((item) => item.selected) || section.artifacts[layer].at(-1) || null; }
function pendingArtifact(layer: FactoryLayer, versions: FactoryArtifactVersion[]): FactoryArtifactVersion { return { id: `pending:${crypto.randomUUID()}`, layer, version: Math.max(0, ...versions.map((item) => item.version)) + 1, selected: true, stale: false, status: "queued", text: "", assetId: null, url: "", durationMs: 0, errorMessage: null }; }
function formatTime(ms: number) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function briefStatus(status: string, sections: FactorySection[]) { const ready = sections.filter((section) => selected(section, "video")?.status === "ready" && !selected(section, "video")?.stale).length; return status === "draft" ? "等待确认文案" : status === "exporting" ? "正在生成最终成片" : status === "completed" ? "全部内容已导出" : `自动生成 ${ready} / ${sections.length}`; }
