import { Copy, Download, Music2, PencilLine, RefreshCw, Search, Trash2, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Empty, Form, Input, Modal, Pagination, Select, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { updateCloudAsset } from "@/services/api/cloud-assets";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { exportAssets, restoreAssetPackage } from "./asset-transfer";
import { uploadAssetFile } from "./asset-file";
import { runAssetUploadBatch } from "./asset-upload-batch";
import { AssetExportModal } from "./components/asset-export-modal";
import { AssetUploadDropzone } from "./components/asset-upload-dropzone";
import { LibraryPage } from "@/components/layout/page-shell";
import { MediaAssetCard, mediaAssetFileExtension } from "@/components/media/media-asset-card";
import { MediaAssetDrawer } from "@/components/media/media-asset-drawer";

type AssetFormValues = {
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function AssetsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const initializeAssets = useAssetStore((state) => state.initialize);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);
    const [restoring, setRestoring] = useState(false);
    const [syncingCharacters, setSyncingCharacters] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind !== "text"), [assets]);

    useEffect(() => {
        void initializeAssets();
    }, [initializeAssets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        form.setFieldsValue({
            title: asset.title,
            coverUrl: asset.coverUrl,
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        if (!editingAsset) return;
        setSaving(true);
        try {
            const values = await form.validateFields();
            const metadata = { ...(editingAsset?.metadata || {}), tags: values.tags || [], source: values.source?.trim(), note: values.note?.trim(), coverUrl: values.coverUrl?.trim() || "" };
            await updateCloudAsset(editingAsset.id, { title: values.title.trim(), ...(editingAsset.kind === "text" ? { content: (values.content || "").trim() } : {}), metadata });
            await initializeAssets();
            message.success("素材已更新");
            setIsAssetOpen(false);
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadAsset = (asset: Asset) => {
        if (asset.kind === "text") return;
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        saveAs(url, `${asset.title || "asset"}.${mediaAssetFileExtension(asset.data.mimeType, asset.kind)}`);
    };

    const openAssetExport = () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        setExportModalOpen(true);
    };

    const exportSelectedAssets = async (selectedAssets: Asset[]) => {
        try {
            await exportAssets(selectedAssets);
            message.success(`已导出 ${selectedAssets.length} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导出失败");
            throw error;
        }
    };

    const importAssetZip = async (file?: File) => {
        if (!file) return;
        setRestoring(true);
        try {
            const result = await restoreAssetPackage(file);
            await initializeAssets();
            if (result.failed) message.warning(`已导入 ${result.restored} 个素材，${result.failed} 个失败`);
            else message.success(`已导入 ${result.restored} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败，请选择有效的 CrocoTV 素材包");
        } finally {
            setRestoring(false);
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const uploadFiles = async (files: File[]) => {
        if (!files.length) return;
        setUploading(true);
        setUploadCount(files.length);
        try {
            const result = await runAssetUploadBatch(files, uploadAssetFile);
            if (result.accepted) await initializeAssets();
            const rejected = result.failed + result.unsupported;
            if (!result.accepted) message.warning("仅支持上传图片、视频和音频文件");
            else if (rejected) message.warning(`已上传 ${result.uploaded} 个素材，${rejected} 个未上传${result.unsupported ? `（${result.unsupported} 个格式不支持）` : ""}`);
            else message.success(`已上传 ${result.uploaded} 个素材`);
        } finally {
            setUploading(false);
            setUploadCount(0);
        }
    };

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    const syncCharacterAssets = async () => {
        setSyncingCharacters(true);
        try {
            const response = await fetch("/api/characters/sync", { method: "POST" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "角色资源同步失败");
            await initializeAssets();
            message.success(`已同步 ${payload.remoteCharacters || 0} 个角色，新增 ${payload.assetsDownloaded || 0} 个资源`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "角色资源同步失败");
        } finally {
            setSyncingCharacters(false);
        }
    };

    return (
        <LibraryPage
            title="我的素材"
            description="统一管理手动上传、角色同步以及图片、视频、语音和音乐生成结果；所有文件均保存在本地。"
            header={
                <>
                    <div className="mx-auto w-full max-w-2xl">
                        <Input.Search
                            className="w-full"
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            onSearch={(value) => {
                                setPage(1);
                                setKeyword(value);
                            }}
                        />
                    </div>

                    <div className="mx-auto mt-6 w-full max-w-4xl">
                        <AssetUploadDropzone uploading={uploading} uploadCount={uploadCount} onFiles={(files) => void uploadFiles(files)} />
                    </div>

                    <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                            <div className="flex flex-wrap items-center gap-4">
                                <Button type="text" icon={<RefreshCw className={`size-4 ${syncingCharacters ? "animate-spin" : ""}`} />} loading={syncingCharacters} onClick={() => void syncCharacterAssets()}>
                                    同步角色资源
                                </Button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    disabled={restoring}
                                    onClick={() => assetInputRef.current?.click()}
                                    title="仅支持 CrocoTV 导出的 ZIP 素材包"
                                >
                                    {restoring ? "导入中..." : "导入素材包（ZIP）"}
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={openAssetExport}
                                >
                                    导出素材
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            }
        >

                <div className="flex flex-col gap-5">
                    <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleAssets.map((asset) => (
                            <MediaAssetCard
                                key={asset.id}
                                asset={asset}
                                badge={asset.source === "character" ? <Tag color="blue" className="m-0 text-[11px]">角色资源</Tag> : null}
                                onOpen={() => setPreviewAsset(asset)}
                                actions={[
                                    { key: "edit", label: "编辑", icon: <PencilLine className="size-3.5" />, onClick: () => openEdit(asset) },
                                    ...(asset.kind === "text"
                                        ? [{ key: "copy", label: "复制", icon: <Copy className="size-3.5" />, onClick: () => void copyAssetText(asset) }]
                                        : [{ key: "download", label: "下载", icon: <Download className="size-3.5" />, onClick: () => downloadAsset(asset) }]),
                                    ...(asset.source === "character" ? [] : [{ key: "delete", label: "删除", icon: <Trash2 className="size-3.5" />, danger: true, onClick: () => setDeletingAsset(asset) }]),
                                ]}
                            />
                        ))}
                    </div>

                    {!visibleAssets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}

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

            <Modal title="编辑素材" open={isAssetOpen} width={980} onCancel={() => setIsAssetOpen(false)} onOk={() => void saveAsset()} okText="保存" cancelText="取消" confirmLoading={saving} destroyOnHidden>
                <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <Form form={form} layout="vertical" requiredMark={false} initialValues={{ tags: [] }}>
                        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input size="large" placeholder="给素材起一个容易检索的名字" />
                        </Form.Item>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Input placeholder="可选；图片默认使用原图，音视频可填写自定义封面" />
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label="来源">
                                <Input placeholder="手动添加 / 画布 / 工作台" />
                            </Form.Item>
                            <Form.Item name="note" label="备注">
                                <Input placeholder="可选" />
                            </Form.Item>
                        </div>
                        {!editingAsset || editingAsset.kind === "text" ? (
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
                            </Form.Item>
                        ) : (
                            <Typography.Text type="secondary">编辑时不会替换原始媒体文件。</Typography.Text>
                        )}
                    </Form>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950">
                        <Typography.Text strong>预览</Typography.Text>
                        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
                            {coverUrl ? (
                                <img src={coverUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                            ) : (
                                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm text-stone-500 dark:bg-stone-900">{editingAsset?.kind === "audio" ? <Music2 className="size-10" /> : editingAsset?.kind === "video" ? <Video className="size-10" /> : content || "暂无封面"}</div>
                            )}
                            <div className="p-4">
                                <Typography.Text strong ellipsis className="block">
                                    {title || "未命名素材"}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag) => (
                                            <Tag key={tag} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">未打标签</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            <MediaAssetDrawer
                asset={previewAsset}
                onClose={() => setPreviewAsset(null)}
                actions={previewAsset ? previewAsset.kind === "text"
                    ? <Button type="primary" icon={<Copy className="size-4" />} onClick={() => copyAssetText(previewAsset)}>复制文本</Button>
                    : <Button type="primary" icon={<Download className="size-4" />} onClick={() => downloadAsset(previewAsset)}>下载素材</Button>
                    : null}
            />

            <AssetExportModal open={exportModalOpen} assets={validAssets} onCancel={() => setExportModalOpen(false)} onExport={exportSelectedAssets} />
            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </LibraryPage>
    );
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
