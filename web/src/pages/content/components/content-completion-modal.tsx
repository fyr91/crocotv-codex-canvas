import { App, Button, Input, Modal } from "antd";
import { Upload } from "lucide-react";
import { useState } from "react";

import { uploadAssetFile } from "@/pages/assets/asset-file";

export function ContentCompletionModal({
    open,
    completing,
    onClose,
    onComplete,
}: {
    open: boolean;
    completing: boolean;
    onClose: () => void;
    onComplete: (finalAssetId: string, notes: string) => Promise<void>;
}) {
    const { message } = App.useApp();
    const [file, setFile] = useState<File | null>(null);
    const [notes, setNotes] = useState("");
    const [uploading, setUploading] = useState(false);
    const submit = async () => {
        if (!file) return message.warning("请上传最终完成的视频或媒体凭据");
        setUploading(true);
        try {
            const asset = await uploadAssetFile(file);
            await onComplete(asset.id, notes);
            setFile(null);
            setNotes("");
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Topic 完成失败");
        } finally {
            setUploading(false);
        }
    };
    return (
        <Modal
            title="完成 Topic"
            open={open}
            onCancel={onClose}
            footer={<><Button onClick={onClose}>取消</Button><Button type="primary" loading={uploading || completing} onClick={() => void submit()}>上传凭据并完成</Button></>}
        >
            <p className="mb-4 text-sm leading-6 text-stone-500">完成由 Owner 主动确认，必须上传最终视频或媒体作为凭据。完成后仍可继续修改，再次完成会保留新的历史版本。</p>
            <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm dark:border-stone-700">
                <Upload className="size-4" />
                <span>{file?.name || "选择最终视频 / 媒体"}</span>
                <input type="file" accept="video/*,audio/*,image/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <Input.TextArea value={notes} rows={4} placeholder="完成说明（可选）" onChange={(event) => setNotes(event.target.value)} />
        </Modal>
    );
}
