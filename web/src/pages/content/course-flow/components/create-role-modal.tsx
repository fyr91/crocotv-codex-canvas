import { App, Button, Form, Input, Modal, Select, Upload } from "antd";
import { UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { setCloudAssetShared } from "@/services/api/cloud-assets";
import { createCourseFlowRole } from "@/services/api/course-flow";
import { uploadImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";

const previewCopy = "你好，欢迎来到 CrocoTV 内容生产平台。在这里，你可以把一个想法快速转化为结构清晰、画面生动的课程内容。";

type Values = { name: string; description: string; voiceId: string };

export function CreateRoleModal({ open, config, speechModel, voices, onClose, onCreated }: {
    open: boolean;
    config: AiConfig;
    speechModel: string;
    voices: Array<{ value: string; label: string }>;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { message } = App.useApp();
    const [form] = Form.useForm<Values>();
    const [designSheet, setDesignSheet] = useState<File | null>(null);
    const [front, setFront] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (open) form.setFieldsValue({ voiceId: voices[0]?.value }); }, [form, open, voices]);
    const submit = async () => {
        const values = await form.validateFields();
        if (!designSheet || !front) return message.error("请上传三视图和正视图");
        if (!speechModel) return message.error("尚未配置 Expressive 语音模型");
        setSaving(true);
        try {
            const [sheetAsset, frontAsset] = await Promise.all([uploadImage(designSheet, { compress: true }), uploadImage(front, { compress: true })]);
            const voiceName = voices.find((voice) => voice.value === values.voiceId)?.label || values.voiceId;
            const preview = await requestAudioGeneration({ ...config, model: speechModel, audioVoice: values.voiceId, audioInstructions: "亲切、自然、清晰地介绍平台" }, previewCopy);
            const previewAsset = await storeGeneratedAudio(preview);
            await Promise.all([sheetAsset.storageKey, frontAsset.storageKey, previewAsset.storageKey].map((id) => setCloudAssetShared(id, true)));
            await createCourseFlowRole({ name: values.name, description: values.description || "", designSheetAssetId: sheetAsset.storageKey, frontAssetId: frontAsset.storageKey, voiceId: values.voiceId, voiceName, previewAssetId: previewAsset.storageKey });
            message.success("角色已创建");
            form.resetFields(); setDesignSheet(null); setFront(null); onCreated();
        } catch (error) { message.error(error instanceof Error ? error.message : "角色创建失败"); }
        finally { setSaving(false); }
    };
    return (
        <Modal open={open} title="创建课程角色" onCancel={onClose} confirmLoading={saving} onOk={() => void submit()} okText="创建角色" destroyOnHidden maskClosable={!saving}>
            <Form form={form} layout="vertical" requiredMark="optional" className="pt-2">
                <Form.Item name="name" label="角色名称" rules={[{ required: true, whitespace: true, message: "请输入角色名称" }]}><Input maxLength={30} placeholder="例如：林老师" /></Form.Item>
                <Form.Item name="description" label="角色描述"><Input.TextArea rows={3} maxLength={200} showCount placeholder="角色气质与讲授风格" /></Form.Item>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FileUpload label="包含三视图的角色图片" file={designSheet} onChange={setDesignSheet} />
                    <FileUpload label="角色正视图" file={front} onChange={setFront} />
                </div>
                <Form.Item name="voiceId" label="角色声音" rules={[{ required: true, message: "请选择角色声音" }]}><Select options={voices} placeholder="选择内置声音" /></Form.Item>
            </Form>
        </Modal>
    );
}

function FileUpload({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File) => void }) {
    const [preview, setPreview] = useState("");
    useEffect(() => {
        if (!file) { setPreview(""); return; }
        const reader = new FileReader();
        reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : "");
        reader.readAsDataURL(file);
        return () => reader.abort();
    }, [file]);
    return (
        <div className="mb-5">
            <p className="mb-2 text-sm">{label}</p>
            <Upload accept="image/*" maxCount={1} showUploadList={false} className="block w-full" beforeUpload={(next) => { onChange(next); return false; }}>
                {preview ? <button type="button" className="group relative h-36 w-full overflow-hidden rounded-xl border border-border bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <img src={preview} alt={`${label}预览`} className="size-full object-contain" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">更换图片</span>
                </button> : <Button icon={<UploadCloud className="size-4" />} className="h-36 w-full border-dashed">选择图片</Button>}
            </Upload>
        </div>
    );
}
