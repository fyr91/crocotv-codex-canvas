import { Download, Lightbulb, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Pagination, Spin, Tag } from "antd";
import { saveAs } from "file-saver";

import { cn } from "@/lib/utils";
import { listSharedCloudAssets, unshareCloudAssetAsSuperuser } from "@/services/api/cloud-assets";
import { assetFromCloudAsset, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { ContentInspirationModal } from "@/pages/content/components/content-inspiration-modal";
import { LibraryPage } from "@/components/layout/page-shell";
import { MediaAssetCard, mediaAssetFileExtension } from "@/components/media/media-asset-card";
import { MediaAssetDrawer } from "@/components/media/media-asset-drawer";

const supportedKinds = ["image", "video", "audio"] as const;
type MediaAsset = Exclude<Asset, { kind: "text" }>;
const kindOptions = [
    { label: "全部", value: "all" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function SharedAssetsPage() {
    const { message, modal } = App.useApp();
    const profile = useUserStore((state) => state.profile);
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
    const [removingAssetId, setRemovingAssetId] = useState("");
    const [inspirationAsset, setInspirationAsset] = useState<MediaAsset | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        void listSharedCloudAssets()
            .then((rows) => {
                if (active) setAssets(rows.map(assetFromCloudAsset).filter(isMediaAsset));
            })
            .catch((error) => {
                if (!active) return;
                setAssets([]);
                message.error(error instanceof Error ? error.message : "共享素材加载失败");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [message]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return [asset.title, asset.source || "", asset.note || "", asset.tags.join(" ")].join(" ").toLowerCase().includes(query);
        });
    }, [assets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        setPage((value) => Math.min(value, Math.max(1, Math.ceil(filteredAssets.length / pageSize))));
    }, [filteredAssets.length, pageSize]);

    const downloadAsset = (asset: MediaAsset) => {
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        saveAs(url, `${asset.title || "asset"}.${mediaAssetFileExtension(asset.data.mimeType, asset.kind)}`);
    };

    const removeSharedAsset = (asset: MediaAsset) => {
        modal.confirm({
            title: "移出共享素材？",
            content: "仅移出共享，不会删除原作者的素材。",
            okText: "移出共享",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setRemovingAssetId(asset.id);
                try {
                    await unshareCloudAssetAsSuperuser(asset.id);
                    setAssets((current) => current.filter((item) => item.id !== asset.id));
                    setPreviewAsset((current) => current?.id === asset.id ? null : current);
                    message.success("已移出共享素材");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "移出共享素材失败");
                    throw error;
                } finally {
                    setRemovingAssetId("");
                }
            },
        });
    };

    return (
        <LibraryPage
            title="共享素材"
            description="浏览公司成员共享的图片、视频和音频素材。"
            header={
                <>
                    <div className="mx-auto w-full max-w-2xl">
                        <Input.Search
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="搜索标题、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                        />
                    </div>

                    <div className="mx-auto mt-6 max-w-6xl">
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-center">
                            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">类型</div>
                            <div className="flex flex-wrap gap-2">
                                {kindOptions.map((option) => (
                                    <Tag.CheckableTag
                                        key={option.value}
                                        checked={kindFilter === option.value}
                                        className={cn("filter-chip", kindFilter === option.value && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            setKindFilter(option.value as AssetKind | "all");
                                        }}
                                    >
                                        {option.label}
                                    </Tag.CheckableTag>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            }
        >

                <div className="flex flex-col gap-5">
                    <Spin spinning={loading} tip="正在加载共享素材">
                        <div className="grid min-h-56 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {visibleAssets.map((asset) => (
                                <MediaAssetCard
                                    key={asset.id}
                                    asset={asset}
                                    onOpen={() => setPreviewAsset(asset)}
                                    actions={[
                                        { key: "download", label: "下载", icon: <Download className="size-3.5" />, onClick: () => downloadAsset(asset) },
                                        { key: "inspiration", label: "作为灵感", icon: <Lightbulb className="size-3.5" />, onClick: () => setInspirationAsset(asset) },
                                        ...(profile?.role === "superuser"
                                            ? [{
                                                key: "remove",
                                                label: removingAssetId === asset.id ? "处理中..." : "移出共享",
                                                icon: <Trash2 className="size-3.5" />,
                                                danger: true,
                                                disabled: removingAssetId === asset.id,
                                                onClick: () => removeSharedAsset(asset),
                                            }]
                                            : []),
                                    ]}
                                />
                            ))}
                        </div>
                        {!loading && !visibleAssets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={assets.length ? "没有找到素材" : "暂无共享素材"} className="py-20" /> : null}
                    </Spin>

                    <div className="flex justify-center">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={filteredAssets.length}
                            showSizeChanger
                            pageSizeOptions={[10, 20, 50, 100]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    </div>
                </div>

            <MediaAssetDrawer
                asset={previewAsset}
                onClose={() => setPreviewAsset(null)}
                actions={previewAsset ? (
                    <>
                        <Button type="primary" icon={<Download className="size-4" />} onClick={() => downloadAsset(previewAsset)}>下载素材</Button>
                        {profile?.role === "superuser" ? <Button danger loading={removingAssetId === previewAsset.id} icon={<Trash2 className="size-4" />} onClick={() => removeSharedAsset(previewAsset)}>移出共享</Button> : null}
                    </>
                ) : null}
            />
            <ContentInspirationModal asset={inspirationAsset} open={Boolean(inspirationAsset)} onClose={() => setInspirationAsset(null)} />
        </LibraryPage>
    );
}

function isMediaAsset(asset: Asset): asset is MediaAsset {
    return supportedKinds.includes(asset.kind as (typeof supportedKinds)[number]);
}
