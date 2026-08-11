import { Button, Empty } from "antd";
import { Download } from "lucide-react";

import type { CourseFlowMode, CourseFlowSegment } from "@/types/course-flow";
import { VideoTrackCell } from "./video-track-cell";

export function VideoStep({ sceneMode = "green_screen", segments, exporting, onRegenerateLtx, onRegenerateShot, onEnhanced, onExport }: {
    sceneMode?: CourseFlowMode;
    segments: CourseFlowSegment[];
    exporting: boolean;
    onRegenerateLtx: (segmentId: string) => void;
    onRegenerateShot: (segmentId: string, shotId: string) => void;
    onEnhanced?: () => void;
    onExport: () => void;
}) {
    const usesGreenScreen = sceneMode === "green_screen";
    return (
        <section className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-8">
            <header className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">生成课程视频</h1><p className="mt-1 text-sm text-muted-foreground">{usesGreenScreen ? "先完成所有语音驱动的绿幕角色视频，再批量生成分镜参考的内容素材视频。" : "根据已确认的分镜参考图，批量生成课程内容视频。"}</p></header>
            {!segments.length ? <Empty className="my-auto" description="尚无可生成的视频片段" /> : <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-[var(--surface-raised)] shadow-[var(--elevation-card)] thin-scrollbar">
                <div className={`sticky top-0 z-10 grid border-b border-border bg-[var(--surface-raised)] text-sm font-medium ${usesGreenScreen ? "min-w-[920px] grid-cols-[180px_1fr_1fr]" : "min-w-[680px] grid-cols-[180px_1fr]"}`}><div className="p-4">片段与文案</div>{usesGreenScreen ? <div className="border-l border-border p-4">角色绿幕视频</div> : null}<div className="border-l border-border p-4">{usesGreenScreen ? "内容素材视频" : "内容视频"}</div></div>
                {segments.map((segment) => <article key={segment.id} className={`grid border-b border-border last:border-b-0 ${usesGreenScreen ? "min-w-[920px] grid-cols-[180px_1fr_1fr]" : "min-w-[680px] grid-cols-[180px_1fr]"}`}>
                    <div className="p-4"><span className="text-xs font-medium text-muted-foreground">片段 {String(segment.position + 1).padStart(2, "0")}</span><p className="mt-2 line-clamp-6 text-sm leading-6">{segment.text}</p></div>
                    {usesGreenScreen ? <div className="border-l border-border p-4"><VideoTrackCell video={segment.ltxVideo} onRegenerate={() => onRegenerateLtx(segment.id)} onEnhanced={onEnhanced} /></div> : null}
                    <div className="space-y-5 border-l border-border p-4">{segment.materialShots.map((shot) => <VideoTrackCell key={shot.id} video={shot.video} onRegenerate={() => onRegenerateShot(segment.id, shot.id)} onEnhanced={onEnhanced} />)}</div>
                </article>)}
            </div>}
            <footer className="mt-4 flex justify-end"><Button type="primary" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>导出 ZIP</Button></footer>
        </section>
    );
}
