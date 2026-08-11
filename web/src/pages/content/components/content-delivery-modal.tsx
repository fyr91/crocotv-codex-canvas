import { App, Button, Empty, List, Modal, Tag } from "antd";
import { Download } from "lucide-react";
import { saveAs } from "file-saver";
import { useState } from "react";

import { createZip } from "@/lib/zip";
import { getCloudAsset } from "@/services/api/cloud-assets";
import type { ContentDeliveryManifest } from "@/types/content-production";

export function ContentDeliveryModal({
    open,
    manifest,
    onClose,
    onCreateSnapshot,
}: {
    open: boolean;
    manifest: ContentDeliveryManifest | null;
    onClose: () => void;
    onCreateSnapshot: () => Promise<void>;
}) {
    const { message } = App.useApp();
    const [downloading, setDownloading] = useState(false);
    const download = async () => {
        if (!manifest?.clips.length) return;
        setDownloading(true);
        try {
            await onCreateSnapshot();
            const files = await Promise.all(manifest.clips.map(async (clip) => {
                const asset = await getCloudAsset(clip.assetId);
                if (!asset.url) throw new Error(`${clip.fileName} 无法建立下载链接`);
                return { name: `clips/${clip.fileName}`, data: await (await fetch(asset.url)).blob() };
            }));
            const zip = await createZip([
                { name: "manifest.json", data: JSON.stringify(manifest, null, 2) },
                ...files,
            ]);
            saveAs(zip, `${manifest.topic.title}-Delivery.zip`);
            message.success(`已导出 ${manifest.clips.length} 个 Clip`);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "交付包导出失败");
        } finally {
            setDownloading(false);
        }
    };
    return (
        <Modal
            title="Topic 交付包"
            open={open}
            onCancel={onClose}
            footer={<><Button onClick={onClose}>取消</Button><Button type="primary" loading={downloading} disabled={!manifest?.clips.length} icon={<Download className="size-4" />} onClick={() => void download()}>创建版本并下载 ZIP</Button></>}
        >
            {!manifest?.clips.length ? <Empty description="请先在各镜头中勾选至少一个 Clip" /> : (
                <>
                    <p className="mb-4 text-sm text-stone-500">同一镜头可包含多个 Take。交付包只导出当前勾选结果和 Manifest，不自动剪辑。</p>
                    <List
                        dataSource={manifest.clips}
                        renderItem={(clip) => <List.Item><span className="min-w-0 flex-1 truncate text-sm">{clip.fileName}</span><Tag>{clip.source === "upload" ? "上传" : "AI"}</Tag></List.Item>}
                    />
                </>
            )}
        </Modal>
    );
}
