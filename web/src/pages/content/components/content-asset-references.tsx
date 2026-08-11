import { App, Button, Empty, Input, List, Modal, Select, Space, Tag } from "antd";
import { Link2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listSharedCloudAssets } from "@/services/api/cloud-assets";
import { assetFromCloudAsset, useAssetStore, type Asset } from "@/stores/use-asset-store";
import type { ContentNodeReference } from "@/types/content-production";

export function ContentAssetReferences({
    references,
    editable,
    onAttach,
    onRemove,
}: {
    references: ContentNodeReference[];
    editable: boolean;
    onAttach: (assetId: string, purpose: string) => Promise<void>;
    onRemove: (referenceId: string) => Promise<void>;
}) {
    const { message } = App.useApp();
    const assets = useAssetStore((state) => state.assets);
    const hydrated = useAssetStore((state) => state.hydrated);
    const initialize = useAssetStore((state) => state.initialize);
    const [sharedAssets, setSharedAssets] = useState<Asset[]>([]);
    const [open, setOpen] = useState(false);
    const [assetId, setAssetId] = useState("");
    const [purpose, setPurpose] = useState("视觉、角色或场景参考");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!hydrated) void initialize();
    }, [hydrated, initialize]);
    useEffect(() => {
        void listSharedCloudAssets().then((rows) => setSharedAssets(rows.filter((row) => ["text", "image", "video", "audio"].includes(row.kind)).map(assetFromCloudAsset))).catch(() => setSharedAssets([]));
    }, []);

    const allAssets = useMemo(() => {
        const byId = new Map([...assets, ...sharedAssets].map((asset) => [asset.id, asset]));
        return [...byId.values()];
    }, [assets, sharedAssets]);
    const assetById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);

    const attach = async () => {
        if (!assetId || !purpose.trim()) return;
        setSaving(true);
        try {
            await onAttach(assetId, purpose.trim());
            message.success("素材已显式引用到当前节点");
            setOpen(false);
            setAssetId("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材引用失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-stone-500">显式素材引用</span>
                <Button size="small" disabled={!editable} icon={<Link2 className="size-3.5" />} onClick={() => setOpen(true)}>引用素材</Button>
            </div>
            {!references.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="V1 不自动匹配素材" className="!my-3" /> : (
                <List
                    size="small"
                    dataSource={references}
                    renderItem={(reference) => {
                        const asset = reference.assetId ? assetById.get(reference.assetId) : null;
                        return (
                            <List.Item
                                actions={editable ? [<Button key="remove" type="text" danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => void onRemove(reference.id)} />] : undefined}
                            >
                                <List.Item.Meta
                                    title={<Space size={6}><span>{asset?.title || reference.assetId || "节点引用"}</span>{asset ? <Tag>{asset.kind}</Tag> : null}</Space>}
                                    description={reference.purpose}
                                />
                            </List.Item>
                        );
                    }}
                />
            )}
            <Modal title="从现有素材库引用" open={open} onCancel={() => setOpen(false)} onOk={() => void attach()} okText="添加引用" confirmLoading={saving}>
                <div className="space-y-4 pt-2">
                    <Select
                        showSearch
                        className="w-full"
                        value={assetId || undefined}
                        placeholder="选择我的素材或共享素材"
                        optionFilterProp="label"
                        options={allAssets.map((asset) => ({ value: asset.id, label: `${asset.title} · ${asset.kind}` }))}
                        onChange={setAssetId}
                    />
                    <Input.TextArea value={purpose} rows={3} placeholder="说明这个素材在当前节点中的用途" onChange={(event) => setPurpose(event.target.value)} />
                    <p className="text-xs leading-5 text-stone-500">素材仍在“我的素材 / 共享素材”统一管理；这里仅保存引用关系，不复制资源。</p>
                </div>
            </Modal>
        </div>
    );
}
