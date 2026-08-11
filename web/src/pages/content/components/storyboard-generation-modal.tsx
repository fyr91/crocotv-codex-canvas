import { App, Button, Input, Modal, Tag } from "antd";
import { FileText, Image, Music2, Plus, Trash2, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { uploadAssetFile } from "@/pages/assets/asset-file";
import { useAssetStore } from "@/stores/use-asset-store";
import type { ContentStoryboardReference } from "@/types/content-production";

const labels = { text: "文本", image: "图片", video: "视频", audio: "音频" } as const;
const icons = { text: FileText, image: Image, video: Video, audio: Music2 } as const;

export function StoryboardGenerationModal({
    open,
    submitting,
    allowedKinds,
    onClose,
    onSubmit,
}: {
    open: boolean;
    submitting: boolean;
    allowedKinds: ContentStoryboardReference["kind"][];
    onClose: () => void;
    onSubmit: (value: { references: ContentStoryboardReference[]; additionalInfo?: string }) => Promise<void>;
}) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const initialize = useAssetStore((state) => state.initialize);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [references, setReferences] = useState<ContentStoryboardReference[]>([]);
    const [additionalInfo, setAdditionalInfo] = useState("");

    useEffect(() => {
        if (!open) return;
        setReferences([]);
        setAdditionalInfo("");
        void initialize();
    }, [initialize, open]);

    const addReference = (payload: InsertAssetPayload) => {
        if (!allowedKinds.includes(payload.kind)) {
            message.warning(`当前分镜模型不支持${labels[payload.kind]}输入`);
            return;
        }
        setReferences((current) => current.some((item) => item.assetId === payload.assetId)
            ? current
            : [...current, {
                title: payload.title,
                kind: payload.kind,
                assetId: payload.assetId,
                ...(payload.kind === "text" ? { content: payload.content } : {}),
            }]);
        setPickerOpen(false);
    };

    const uploadFiles = async (files: File[]) => {
        const supported = files.filter((file) => {
            const kind = kindForFile(file);
            return kind && allowedKinds.includes(kind);
        });
        if (!supported.length) return message.warning("所选文件类型不受当前分镜模型支持");
        setUploading(true);
        try {
            const uploaded: ContentStoryboardReference[] = [];
            for (const file of supported) {
                if (file.type.startsWith("text/")) {
                    const content = await file.text();
                    const assetId = await addAsset({
                        kind: "text",
                        title: file.name,
                        coverUrl: "",
                        tags: [],
                        source: "分镜参考",
                        data: { content },
                        metadata: { source: "storyboard-reference", originalName: file.name },
                    });
                    uploaded.push({ title: file.name, kind: "text", content, assetId });
                } else {
                    const asset = await uploadAssetFile(file);
                    uploaded.push({ title: asset.title || file.name, kind: asset.kind, assetId: asset.id });
                }
            }
            setReferences((current) => [
                ...current,
                ...uploaded.filter((item) => !current.some((existing) => existing.assetId === item.assetId)),
            ]);
            await initialize();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考素材上传失败");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const drop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        void uploadFiles([...event.dataTransfer.files]);
    };

    return (
        <>
            <Modal
                title="生成分镜脚本"
                open={open}
                width={680}
                okText="开始生成"
                cancelText="取消"
                confirmLoading={submitting || uploading}
                onCancel={onClose}
                onOk={() => void onSubmit({
                    references: references.map((item) => ({ ...item, title: item.title.trim() || labels[item.kind] })),
                    ...(additionalInfo.trim() ? { additionalInfo: additionalInfo.trim() } : {}),
                })}
            >
                <div className="space-y-5 pt-2">
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium">参考素材 <span className="font-normal text-muted-foreground">（可不填）</span></div>
                                <div className="mt-1 text-xs text-muted-foreground">支持多份文本、图片、视频或音频；仅显示当前模型可解析的类型。</div>
                            </div>
                            <Button icon={<Plus className="size-4" />} onClick={() => setPickerOpen(true)}>从素材库添加</Button>
                        </div>
                        <div
                            className="grid min-h-24 cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center transition hover:bg-muted/60"
                            role="button"
                            tabIndex={0}
                            onClick={() => inputRef.current?.click()}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={drop}
                        >
                            <div>
                                <Upload className="mx-auto mb-2 size-5 text-muted-foreground" />
                                <div className="text-sm">{uploading ? "正在上传…" : "拖拽文件到这里，或点击上传"}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{allowedKinds.map((kind) => labels[kind]).join("、")}</div>
                            </div>
                        </div>
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept={acceptForKinds(allowedKinds)}
                            onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
                        />
                        {references.length ? (
                            <div className="mt-3 space-y-2">
                                {references.map((reference, index) => {
                                    const Icon = icons[reference.kind];
                                    return (
                                        <div key={`${reference.assetId || reference.title}:${index}`} className="flex items-center gap-2 rounded-lg border border-border p-2">
                                            <Icon className="ml-1 size-4 shrink-0 text-muted-foreground" />
                                            <Input
                                                variant="borderless"
                                                value={reference.title}
                                                aria-label={`参考素材 ${index + 1} 标题`}
                                                onChange={(event) => setReferences((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                                            />
                                            <Tag className="m-0 shrink-0">{labels[reference.kind]}</Tag>
                                            <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                    <label className="block">
                        <span className="mb-2 block text-sm font-medium">补充说明 <span className="font-normal text-muted-foreground">（可不填）</span></span>
                        <Input.TextArea
                            value={additionalInfo}
                            rows={4}
                            placeholder="例如：保持写实电影质感，优先拆分动作转折明显的镜头。"
                            onChange={(event) => setAdditionalInfo(event.target.value)}
                        />
                    </label>
                </div>
            </Modal>
            <AssetPickerModal open={pickerOpen} allowedKinds={allowedKinds} onInsert={addReference} onClose={() => setPickerOpen(false)} />
        </>
    );
}

function kindForFile(file: File): ContentStoryboardReference["kind"] | null {
    if (file.type.startsWith("text/") || /\.(txt|md|markdown)$/i.test(file.name)) return "text";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return null;
}

function acceptForKinds(kinds: ContentStoryboardReference["kind"][]) {
    const values = { text: "text/*,.txt,.md", image: "image/*", video: "video/*", audio: "audio/*" };
    return kinds.map((kind) => values[kind]).join(",");
}
