import { App, Button, Divider, Tag } from "antd";
import { FileText, Image, Trash2, Upload, Video } from "lucide-react";
import { useEffect, useState, type DragEvent, type ReactNode } from "react";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { uploadAssetFile } from "@/pages/assets/asset-file";
import { useAssetStore } from "@/stores/use-asset-store";
import type { ContentNodeReference, ContentTopicOrientation } from "@/types/content-production";
import { TopicOrientationForm } from "./topic-orientation-form";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./content-node-panel-tabs";

export function TopicNodePanel({
    orientation,
    references,
    editable,
    saving,
    generating,
    onSave,
    onGenerate,
    onAttach,
    onRemove,
    panelTab = "content",
    tuningEnabled = false,
    tuning = null,
    onPanelTabChange = () => undefined,
}: {
    orientation: ContentTopicOrientation | null;
    references: ContentNodeReference[];
    editable: boolean;
    saving: boolean;
    generating: boolean;
    onSave: (value: ContentTopicOrientation) => Promise<void>;
    onGenerate: (value: ContentTopicOrientation) => Promise<void>;
    onAttach: (assetId: string, purpose: string) => Promise<void>;
    onRemove: (referenceId: string) => Promise<void>;
    panelTab?: ContentNodePanelTab;
    tuningEnabled?: boolean;
    tuning?: ReactNode;
    onPanelTabChange?: (tab: ContentNodePanelTab) => void;
}) {
    const { message } = App.useApp();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const hydrated = useAssetStore((state) => state.hydrated);
    const initialize = useAssetStore((state) => state.initialize);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    useEffect(() => {
        if (!hydrated) void initialize();
    }, [hydrated, initialize]);

    const attach = async (payload: InsertAssetPayload) => {
        if (payload.kind === "audio") {
            message.warning("选题参考暂时只支持文本、图片和视频");
            return;
        }
        if (!references.some((item) => item.assetId === payload.assetId)) {
            await onAttach(payload.assetId, "选题生成参考");
        }
        setPickerOpen(false);
    };

    const uploadFiles = async (files: File[]) => {
        const supported = files.filter((file) => file.type.startsWith("text/") || file.type.startsWith("image/") || file.type.startsWith("video/"));
        if (!supported.length) return message.warning("只支持文本、图片和视频素材");
        setUploading(true);
        try {
            for (const file of supported) {
                const assetId = file.type.startsWith("text/")
                    ? await addAsset({
                        kind: "text",
                        title: file.name,
                        coverUrl: "",
                        tags: [],
                        source: "Topic",
                        data: { content: await file.text() },
                        metadata: { source: "topic-reference", originalName: file.name },
                    })
                    : (await uploadAssetFile(file)).id;
                if (!references.some((item) => item.assetId === assetId)) await onAttach(assetId, "选题生成参考");
            }
            await initialize();
            message.success("参考素材已添加");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考素材上传失败");
        } finally {
            setUploading(false);
        }
    };

    const drop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        if (files.length) {
            void uploadFiles(files);
            return;
        }
        const text = event.dataTransfer.getData("text/plain").trim();
        if (!text) return;
        void (async () => {
            const assetId = await addAsset({
                kind: "text",
                title: text.slice(0, 24) || "拖入文本",
                coverUrl: "",
                tags: [],
                source: "Topic",
                data: { content: text },
                metadata: { source: "topic-reference" },
            });
            await onAttach(assetId, "选题生成参考");
        })();
    };

    const contentPanel = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-5 py-4">
                <div className="text-xs text-muted-foreground">Topic 设置</div>
                <h2 className="mt-1 font-semibold">内容方向与选题分支</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5" data-canvas-scroll>
                <TopicOrientationForm
                    initialValue={orientation}
                    saving={saving || generating}
                    onSave={onSave}
                    onSubmit={onGenerate}
                    submitLabel="生成选题分支"
                    description="调整内容方向会自动保存；点击下方按钮后生成 5 条独立选题分支。"
                    autosave
                    compact
                />
                <Divider />
                <div className="mb-2 text-sm font-medium">参考素材</div>
                <div
                    role="button"
                    tabIndex={0}
                    className="grid min-h-28 cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center transition hover:bg-muted/60"
                    onClick={() => editable && setPickerOpen(true)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={drop}
                >
                    <div>
                        <Upload className="mx-auto mb-2 size-5 text-muted-foreground" />
                        <div className="text-sm">{uploading ? "正在上传…" : "拖入素材，或点击从素材库选择"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">支持文本、图片、视频</div>
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    {references.map((reference) => {
                        const asset = reference.assetId ? assetById.get(reference.assetId) : null;
                        const Icon = asset?.kind === "image" ? Image : asset?.kind === "video" ? Video : FileText;
                        return (
                            <div key={reference.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                                <Icon className="size-4 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-sm">{asset?.title || reference.assetId || "参考素材"}</span>
                                {asset ? <Tag className="m-0">{asset.kind}</Tag> : null}
                                {editable ? <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => void onRemove(reference.id)} /> : null}
                            </div>
                        );
                    })}
                </div>
            </div>
            <AssetPickerModal open={pickerOpen} allowedKinds={["text", "image", "video"]} onInsert={(payload) => void attach(payload)} onClose={() => setPickerOpen(false)} />
        </div>
    );
    return (
        <ContentNodePanelTabs
            activeKey={panelTab}
            tuningEnabled={tuningEnabled}
            content={contentPanel}
            tuning={tuning}
            contentWidthClass="w-[420px]"
            onChange={onPanelTabChange}
        />
    );
}
