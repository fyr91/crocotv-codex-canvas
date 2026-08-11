import type { ReactNode } from "react";
import { Drawer, Image, Space, Tag, Typography } from "antd";
import { Music2 } from "lucide-react";

import { mediaAssetKindLabel, mediaAssetSummary } from "@/components/media/media-asset-card";
import type { Asset } from "@/stores/use-asset-store";

export function MediaAssetDrawer({ asset, actions, onClose }: { asset: Asset | null; actions?: ReactNode; onClose: () => void }) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";

    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {asset.kind === "image" ? <Image src={asset.data.dataUrl} alt={asset.title} className="rounded-lg" /> : null}
                    {asset.kind === "video" ? <video src={asset.data.url} poster={cover || undefined} controls className="aspect-video w-full rounded-lg bg-black" /> : null}
                    {asset.kind === "audio" ? <div className="rounded-xl border border-border bg-[var(--surface-sunken)] p-5">{cover ? <img src={cover} alt={asset.title} className="mb-4 aspect-[3/1] w-full rounded-lg object-cover" /> : <Music2 className="mx-auto mb-4 size-12 text-muted-foreground" />}<audio src={asset.data.url} controls className="w-full" /></div> : null}
                    <div>
                        <Typography.Title level={4} className="!mb-2">{asset.title}</Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{mediaAssetKindLabel(asset.kind)}</Tag>
                            {(asset.tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                        <Typography.Text type="secondary" className="block text-xs">内容</Typography.Text>
                        {asset.kind === "text" ? <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph> : <Typography.Text className="mt-2 block">{mediaAssetSummary(asset)}</Typography.Text>}
                    </div>
                    {asset.note ? <div><Typography.Text type="secondary">备注</Typography.Text><Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph></div> : null}
                    {actions ? <Space wrap>{actions}</Space> : null}
                </div>
            ) : null}
        </Drawer>
    );
}
