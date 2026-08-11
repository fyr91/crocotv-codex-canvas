import { FileImage, Music2, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Empty, Modal, Tag, Typography } from "antd";

import { assetCardPreview } from "@/lib/asset-preview";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import type { Asset } from "@/stores/use-asset-store";
import { ASSET_EXPORT_BATCH_SIZE, nextAssetExportLimit, selectedAssetsInOrder } from "../asset-export-selection";

type AssetExportModalProps = {
    open: boolean;
    assets: Asset[];
    onCancel: () => void;
    onExport: (assets: Asset[]) => Promise<void>;
};

export function AssetExportModal({ open, assets, onCancel, onExport }: AssetExportModalProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [renderLimit, setRenderLimit] = useState(ASSET_EXPORT_BATCH_SIZE);
    const [exporting, setExporting] = useState(false);
    const visibleAssets = useMemo(() => assets.slice(0, renderLimit), [assets, renderLimit]);
    const allSelected = Boolean(assets.length) && selectedIds.size === assets.length;

    useEffect(() => {
        if (!open) return;
        setSelectedIds(new Set());
        setRenderLimit(ASSET_EXPORT_BATCH_SIZE);
    }, [open]);

    useEffect(() => {
        const assetIds = new Set(assets.map((asset) => asset.id));
        setSelectedIds((current) => {
            const next = new Set([...current].filter((id) => assetIds.has(id)));
            return next.size === current.size ? current : next;
        });
        setRenderLimit((current) => Math.min(current, Math.max(assets.length, ASSET_EXPORT_BATCH_SIZE)));
    }, [assets]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!open || !sentinel || renderLimit >= assets.length) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) setRenderLimit((current) => nextAssetExportLimit(current, assets.length));
            },
            { root: scrollRef.current, rootMargin: "160px 0px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [assets.length, open, renderLimit]);

    const toggleAsset = (id: string) => {
        if (exporting) return;
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const performExport = async (items: Asset[]) => {
        if (!items.length || exporting) return;
        setExporting(true);
        try {
            await onExport(items);
            setSelectedIds(new Set());
            onCancel();
        } catch {
            // The page owns the error message; retaining this state lets the user adjust and retry.
        } finally {
            setExporting(false);
        }
    };

    return (
        <Modal
            title="导出素材"
            open={open}
            width={920}
            centered
            closable={!exporting}
            maskClosable={!exporting}
            keyboard={!exporting}
            onCancel={() => {
                if (!exporting) onCancel();
            }}
            styles={{ body: { padding: 0 } }}
            footer={
                <div className="flex flex-col gap-3 border-t border-stone-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
                    <Typography.Text type="secondary" className="text-xs">
                        已选择 {selectedIds.size} / {assets.length} 个素材
                    </Typography.Text>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button disabled={exporting} onClick={onCancel}>取消</Button>
                        <Button loading={exporting} disabled={!assets.length || exporting} onClick={() => void performExport(assets)}>
                            导出全部（{assets.length}）
                        </Button>
                        <Button type="primary" loading={exporting} disabled={!selectedIds.size || exporting} onClick={() => void performExport(selectedAssetsInOrder(assets, selectedIds))}>
                            导出已选（{selectedIds.size}）
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="border-b border-stone-200 px-5 py-3 dark:border-stone-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Checkbox
                        checked={allSelected}
                        indeterminate={Boolean(selectedIds.size) && !allSelected}
                        disabled={!assets.length || exporting}
                        onChange={() => setSelectedIds(allSelected ? new Set() : new Set(assets.map((asset) => asset.id)))}
                    >
                        全选
                    </Checkbox>
                    <Typography.Text type="secondary" className="text-xs">
                        共 {assets.length} 个 · 已选择 {selectedIds.size} 个
                    </Typography.Text>
                </div>
            </div>

            <div ref={scrollRef} className="max-h-[62vh] min-h-80 overflow-y-auto px-3 py-2">
                {visibleAssets.map((asset) => (
                    <ExportAssetRow key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} disabled={exporting} onToggle={() => toggleAsset(asset.id)} />
                ))}
                {!assets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可导出的素材" className="py-20" /> : null}
                {renderLimit < assets.length ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
            </div>
        </Modal>
    );
}

function ExportAssetRow({ asset, selected, disabled, onToggle }: { asset: Asset; selected: boolean; disabled: boolean; onToggle: () => void }) {
    const preview = assetCardPreview(asset);
    const tags = asset.tags || [];

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={selected}
            className="grid cursor-pointer grid-cols-[auto_76px_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:hover:bg-stone-900"
            onClick={onToggle}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle();
                }
            }}
        >
            <Checkbox checked={selected} disabled={disabled} onClick={(event) => event.stopPropagation()} onChange={onToggle} aria-label={`选择${asset.title}`} />
            <AssetRowPreview asset={asset} preview={preview} />
            <div className="min-w-0 py-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Typography.Text strong ellipsis className="min-w-0 max-w-full text-sm">
                        {asset.title || "未命名素材"}
                    </Typography.Text>
                    <Tag className="m-0 text-[11px]">{assetKindLabel(asset)}</Tag>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span className="truncate">{asset.source || "未标注来源"}</span>
                    <span>{assetDetails(asset)}</span>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                    {tags.slice(0, 3).map((tag) => <Tag key={tag} className="m-0 max-w-32 truncate text-[11px]">{tag}</Tag>)}
                    {tags.length > 3 ? <Tag className="m-0 text-[11px]">+{tags.length - 3}</Tag> : null}
                    {!tags.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
                </div>
            </div>
        </div>
    );
}

function AssetRowPreview({ asset, preview }: { asset: Asset; preview: ReturnType<typeof assetCardPreview> }) {
    const Icon = asset.kind === "video" ? Video : asset.kind === "audio" ? Music2 : FileImage;
    if (preview?.type === "image") return <img src={preview.url} alt="" loading="lazy" className="size-[76px] rounded-md bg-stone-100 object-cover dark:bg-stone-900" />;
    if (preview?.type === "video") return <video src={preview.url} muted playsInline preload="metadata" aria-hidden className="pointer-events-none size-[76px] rounded-md bg-stone-100 object-cover dark:bg-stone-900" />;
    return <div className="flex size-[76px] items-center justify-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-900"><Icon className="size-7" /></div>;
}

function assetKindLabel(asset: Asset) {
    return asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : asset.kind === "audio" ? "音频" : "文本";
}

function assetDetails(asset: Asset) {
    if (asset.kind === "text") return "文本";
    return [formatBytes(asset.data.bytes), asset.data.durationMs ? formatDuration(asset.data.durationMs) : ""].filter(Boolean).join(" · ");
}
