import { Button, Spin } from "antd";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { MiniMaxH3EnhancementButton } from "@/components/minimax-h3-enhancement-button";
import type { CourseFlowVideoOutput } from "@/types/course-flow";

export function VideoTrackCell({ video, onRegenerate, onEnhanced }: {
    video: CourseFlowVideoOutput | null;
    onRegenerate: () => void;
    onEnhanced?: () => void;
}) {
    const [enhancedUrl, setEnhancedUrl] = useState("");
    useEffect(() => setEnhancedUrl(""), [video?.sourceAssetId]);
    return (
        <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-[var(--surface-sunken)]">
                {video?.url ? <video src={enhancedUrl || video.url} controls className="size-full object-contain" /> : <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><Spin spinning={video?.status === "running" || video?.status === "queued"} /><span>{video?.status === "failed" ? video.errorMessage || "生成失败" : video ? "视频生成中" : "等待生成"}</span></div>}
            </div>
            <MiniMaxH3EnhancementButton variant="block" sourceAssetId={video?.sourceAssetId} eligible={video?.track === "material" && video?.status === "ready"} onReady={(asset) => { setEnhancedUrl(asset.url || ""); onEnhanced?.(); }} />
            <Button icon={<RefreshCw className="size-4" />} onClick={onRegenerate} block>重新生成</Button>
        </div>
    );
}
