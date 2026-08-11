import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Card, Dropdown, Tag, Typography } from "antd";
import { Ellipsis, FileText, ImageIcon, Music2, Video } from "lucide-react";

import { assetCardPreview } from "@/lib/asset-preview";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import type { Asset, AssetKind } from "@/stores/use-asset-store";

export type MediaAssetAction = {
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
};

export function MediaAssetCard({ asset, badge, actions, onOpen }: { asset: Asset; badge?: ReactNode; actions: MediaAssetAction[]; onOpen: () => void }) {
    const preview = assetCardPreview(asset);
    const [failedPreviewUrl, setFailedPreviewUrl] = useState("");
    const previewFailed = preview?.url === failedPreviewUrl;
    const Icon = asset.kind === "video" ? Video : asset.kind === "audio" ? Music2 : asset.kind === "image" ? ImageIcon : FileText;

    return (
        <Card
            hoverable
            className="relative overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <button type="button" className="block w-full text-left" onClick={onOpen}>
                    {preview?.type === "image" && !previewFailed ? (
                        <img src={preview.url} alt={asset.title} loading="lazy" className="aspect-[4/3] w-full object-cover" onError={() => setFailedPreviewUrl(preview.url)} />
                    ) : preview?.type === "video" && !previewFailed ? (
                        <video src={preview.url} muted playsInline preload="metadata" aria-hidden className="pointer-events-none aspect-[4/3] w-full object-cover" onError={() => setFailedPreviewUrl(preview.url)} />
                    ) : (
                        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[var(--surface-sunken)] p-5 text-center text-sm leading-6 text-muted-foreground">
                            {asset.kind === "text" ? <span className="line-clamp-5">{asset.data.content}</span> : <><Icon className="size-10 opacity-65" /><span>{asset.data.durationMs ? formatDuration(asset.data.durationMs) : mediaAssetKindLabel(asset.kind)}</span></>}
                        </div>
                    )}
                </button>
            }
        >
            <div className="absolute right-2 top-2 z-10" onClick={(event) => event.stopPropagation()}>
                <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                        items: actions.map(({ key, label, icon, danger, disabled }) => ({ key, label, icon, danger, disabled })),
                        onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            actions.find((action) => action.key === key)?.onClick();
                        },
                    }}
                >
                    <Button
                        type="text"
                        shape="circle"
                        icon={<Ellipsis className="size-4" />}
                        aria-label="素材操作"
                        title="更多操作"
                        className="!size-8 !min-w-8 !border"
                        style={{
                            background: "var(--surface-overlay)",
                            borderColor: "var(--border-default)",
                            boxShadow: "var(--elevation-card)",
                        }}
                        onClick={(event) => event.stopPropagation()}
                    />
                </Dropdown>
            </div>
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-sm font-semibold text-foreground">{asset.title}</h2>
                            <Typography.Text type="secondary" className="mt-0.5 block text-xs">{asset.source || "未标注来源"}</Typography.Text>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                            <Tag className="m-0 text-[11px]">{mediaAssetKindLabel(asset.kind)}</Tag>
                            {badge}
                        </div>
                    </div>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="!mb-0 !mt-1.5 !text-xs !leading-5">
                        {mediaAssetSummary(asset)}
                    </Typography.Paragraph>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {(asset.tags || []).slice(0, 3).map((tag) => <Tag key={tag} className="m-0 text-[11px]">{tag}</Tag>)}
                        {!asset.tags?.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
                    </div>
                </div>
            </button>
        </Card>
    );
}

export function mediaAssetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    const dimensions = asset.kind === "audio" ? "" : `${asset.data.width}x${asset.data.height}`;
    const duration = asset.data.durationMs ? formatDuration(asset.data.durationMs) : "";
    return [dimensions, duration, formatBytes(asset.data.bytes), asset.data.mimeType].filter(Boolean).join(" · ");
}

export function mediaAssetKindLabel(kind: AssetKind) {
    return kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文本";
}

export function mediaAssetFileExtension(mimeType: string, kind: AssetKind) {
    const extension = mimeType.split("/")[1]?.replace("mpeg", kind === "audio" ? "mp3" : "mp4").replace("quicktime", "mov");
    return extension || (kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3");
}
