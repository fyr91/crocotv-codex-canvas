import { Button, Checkbox, Empty } from "antd";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MiniMaxH3EnhancementButton } from "@/components/minimax-h3-enhancement-button";
import { getCloudAsset } from "@/services/api/cloud-assets";
import { supportsMiniMaxH3HdDimensions } from "@/services/api/minimax-h3-enhancement";
import { providerIdForModel } from "@/stores/use-config-store";
import type { ContentMediaArtifact } from "@/types/content-production";

export type ContentClipView = {
    artifact: ContentMediaArtifact;
    title: string;
    url: string;
    selected: boolean;
};

export function ContentClipResults({
    clips,
    editable,
    selecting,
    uploading,
    onToggle,
    onUpload,
    onEnhanced,
}: {
    clips: ContentClipView[];
    editable: boolean;
    selecting: boolean;
    uploading: boolean;
    onToggle: (clip: ContentClipView, selected: boolean) => Promise<void>;
    onUpload: (file: File) => Promise<void>;
    onEnhanced?: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-stone-500">本镜头 Clip（可多选）</span>
                <Button size="small" disabled={!editable} loading={uploading} icon={<Upload className="size-3.5" />} onClick={() => inputRef.current?.click()}>上传 Clip</Button>
            </div>
            {!clips.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生成或上传 Clip 后在这里勾选" /> : (
                <div className="space-y-3">
                    {clips.map((clip) => <ContentClipCard key={clip.artifact.id} clip={clip} editable={editable} selecting={selecting} onToggle={onToggle} onEnhanced={onEnhanced} />)}
                </div>
            )}
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
                event.currentTarget.value = "";
            }} />
        </div>
    );
}

function ContentClipCard({ clip, editable, selecting, onToggle, onEnhanced }: {
    clip: ContentClipView;
    editable: boolean;
    selecting: boolean;
    onToggle: (clip: ContentClipView, selected: boolean) => Promise<void>;
    onEnhanced?: () => void;
}) {
    const [enhancedUrl, setEnhancedUrl] = useState("");
    const enhancedAssetId = typeof clip.artifact.metadata.enhancedAssetId === "string" ? clip.artifact.metadata.enhancedAssetId : "";
    useEffect(() => {
        setEnhancedUrl("");
        if (!enhancedAssetId) return;
        let active = true;
        void getCloudAsset(enhancedAssetId).then((asset) => { if (active) setEnhancedUrl(asset.url || ""); }).catch(() => undefined);
        return () => { active = false; };
    }, [enhancedAssetId]);
    const providerId = providerIdForModel(String(clip.artifact.metadata.model || "")) || "";
    const eligible = clip.artifact.source === "ai" && supportsMiniMaxH3HdDimensions(providerId, Number(clip.artifact.metadata.width), Number(clip.artifact.metadata.height));
    return (
        <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
            <video src={enhancedUrl || clip.url} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
            <div className="flex items-center gap-3 px-3 py-2">
                <Checkbox checked={clip.selected} disabled={!editable || selecting} onChange={(event) => void onToggle(clip, event.target.checked)} />
                <span className="min-w-0 flex-1 truncate text-xs">{clip.title}</span>
                <span className="text-[11px] text-stone-400">{clip.artifact.source === "upload" ? "上传" : "AI"}</span>
            </div>
            {eligible ? <div className="px-3 pb-3">
                <MiniMaxH3EnhancementButton variant="block" sourceAssetId={clip.artifact.assetId} eligible={eligible} onReady={(asset) => { setEnhancedUrl(asset.url || ""); onEnhanced?.(); }} />
            </div> : null}
        </div>
    );
}
