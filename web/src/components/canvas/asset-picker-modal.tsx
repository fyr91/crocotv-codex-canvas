import { useEffect, useState } from "react";
import { Modal, Spin } from "antd";

import { MediaAssetPicker, type MediaAssetPickerItem } from "@/components/media/media-asset-picker";
import { assetCardPreview } from "@/lib/asset-preview";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export type InsertAssetPayload =
    | { assetId: string; kind: "text"; content: string; title: string }
    | { assetId: string; kind: "image"; dataUrl: string; title: string; storageKey?: string }
    | { assetId: string; kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number }
    | { assetId: string; kind: "audio"; url: string; title: string; storageKey?: string; durationMs?: number; mimeType?: string; audioKind: "speech" | "music" };

type Props = {
    open: boolean;
    title?: string;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
    allowedKinds?: MediaAssetPickerItem["kind"][];
};

export function AssetPickerModal({ open, title = "选择素材", onInsert, onClose, allowedKinds }: Props) {
    const myAssets = useAssetStore((state) => state.assets);
    const initializeAssets = useAssetStore((state) => state.initialize);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        void initializeAssets().finally(() => {
            if (active) setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [initializeAssets, open]);

    return (
        <Modal title={title} open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 520 } }}>
            <div className="pt-4">
                <div className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">我的素材</div>
                <Spin spinning={loading}>
                    <AssetsGrid assets={myAssets} allowedKinds={allowedKinds} onInsert={onInsert} />
                </Spin>
            </div>
        </Modal>
    );
}

function AssetsGrid({ assets, allowedKinds, onInsert }: { assets: Asset[]; allowedKinds?: MediaAssetPickerItem["kind"][]; onInsert: (payload: InsertAssetPayload) => void }) {
    const supported = assets;
    const items: MediaAssetPickerItem[] = supported.map((asset) => {
        const preview = assetCardPreview(asset);
        return { id: asset.id, title: asset.title, kind: asset.kind as MediaAssetPickerItem["kind"], previewUrl: preview?.url, searchText: (asset.tags || []).join(" ") };
    });
    const handleInsert = (item: MediaAssetPickerItem) => {
        const asset = supported.find((value) => value.id === item.id);
        if (!asset) return;
        if (asset.kind === "text") {
            onInsert({ assetId: asset.id, kind: "text", content: asset.data.content, title: asset.title });
            return;
        }
        if (asset.kind === "video") {
            onInsert({ assetId: asset.id, kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height });
            return;
        }
        if (asset.kind === "audio") {
            onInsert({ assetId: asset.id, kind: "audio", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, durationMs: asset.data.durationMs, mimeType: asset.data.mimeType, audioKind: asset.metadata?.audioKind === "music" ? "music" : "speech" });
            return;
        }
        onInsert({ assetId: asset.id, kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title });
    };

    return <MediaAssetPicker items={items} allowedKinds={allowedKinds} onPick={handleInsert} actionLabel="插入" />;
}
