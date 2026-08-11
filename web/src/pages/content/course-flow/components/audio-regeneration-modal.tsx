import { Button, Form, Input, InputNumber, Modal, Tooltip } from "antd";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { normalizeAudioFormatValue, normalizeAudioPitchValue, normalizeAudioSpeedValue, normalizeAudioVolumeValue } from "@/lib/audio-generation";
import type { AiConfig } from "@/stores/use-config-store";

export type CourseAudioRegenerationInput = {
    voiceDirection: string;
} & CourseAudioSettingsInput;

export type CourseAudioSettingsInput = {
    speed: string;
    volume: string;
    pitch: string;
    format: string;
};

export function courseAudioConfigForRegeneration(config: AiConfig, settings: CourseAudioSettingsInput): AiConfig {
    return { ...config, audioSpeed: settings.speed, audioVolume: settings.volume, audioPitch: settings.pitch, audioFormat: settings.format };
}

function AudioSettingsFields() {
    return <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Form.Item className="mb-0" name="speed" label="语速" rules={[{ required: true, message: "请设置语速" }]}><InputNumber aria-label="语速" min={0.5} max={1.5} step={0.05} className="w-full" /></Form.Item>
        <Form.Item className="mb-0" name="volume" label="音量" rules={[{ required: true, message: "请设置音量" }]}><InputNumber aria-label="音量" min={0.5} max={2} step={0.05} className="w-full" /></Form.Item>
        <Form.Item className="mb-0" name="pitch" label="音高" rules={[{ required: true, message: "请设置音高" }]}><InputNumber aria-label="音高" min={-6} max={6} step={1} className="w-full" /></Form.Item>
    </div>;
}

export function AudioRegenerationModal({ open, segmentText, initialValues, onClose, onOptimize, onSubmit }: {
    open: boolean;
    segmentText: string;
    initialValues: CourseAudioRegenerationInput;
    onClose: () => void;
    onOptimize: (currentVoiceDirection: string) => Promise<string>;
    onSubmit: (values: CourseAudioRegenerationInput) => void;
}) {
    const [form] = Form.useForm<CourseAudioRegenerationInput>();
    const [optimizing, setOptimizing] = useState(false);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue(initialValues);
        setOptimizing(false);
    }, [form, initialValues.format, initialValues.pitch, initialValues.speed, initialValues.voiceDirection, initialValues.volume, open]);

    const optimize = async () => {
        setOptimizing(true);
        try {
            const value = await onOptimize(String(form.getFieldValue("voiceDirection") || "").trim());
            if (value) form.setFieldValue("voiceDirection", value);
        } catch {
            // The page reports the recoverable service error and keeps the current form value.
        } finally { setOptimizing(false); }
    };
    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit({
                voiceDirection: values.voiceDirection.trim(),
                speed: normalizeAudioSpeedValue(String(values.speed)),
                volume: normalizeAudioVolumeValue(String(values.volume)),
                pitch: normalizeAudioPitchValue(String(values.pitch)),
                format: normalizeAudioFormatValue(initialValues.format),
            });
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };

    return (
        <Modal open={open} title="重新生成音频" onCancel={onClose} onOk={() => void submit()} okText="生成新版本" cancelText="取消" okButtonProps={{ disabled: optimizing }} destroyOnHidden width={640}>
            <Form form={form} layout="vertical" requiredMark={false}>
                <div className="mb-5 border-b border-border pb-4">
                    <div className="mb-1.5 text-sm font-medium">片段文案</div>
                    <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{segmentText}</p>
                </div>
                <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="course-audio-voice-direction" className="text-sm">语气指导</label><Tooltip title="优化语气指导"><Button type="text" size="small" loading={optimizing} icon={<Sparkles className="size-3.5" />} aria-label="优化语气指导" onClick={() => void optimize()} /></Tooltip></div>
                <Form.Item name="voiceDirection" rules={[{ required: true, whitespace: true, message: "请填写语气指导" }, { max: 260, message: "语气指导不能超过 260 个字符" }]}>
                    <Input.TextArea id="course-audio-voice-direction" aria-label="语气指导" rows={4} placeholder="描述情绪、语速、停顿和重音" />
                </Form.Item>
                <AudioSettingsFields />
            </Form>
        </Modal>
    );
}

export function BatchAudioRegenerationModal({ open, initialValues, onClose, onSubmit }: {
    open: boolean;
    initialValues: CourseAudioSettingsInput;
    onClose: () => void;
    onSubmit: (values: CourseAudioSettingsInput) => void;
}) {
    const [form] = Form.useForm<CourseAudioSettingsInput>();

    useEffect(() => {
        if (open) form.setFieldsValue(initialValues);
    }, [form, initialValues.format, initialValues.pitch, initialValues.speed, initialValues.volume, open]);

    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit({
                speed: normalizeAudioSpeedValue(String(values.speed)),
                volume: normalizeAudioVolumeValue(String(values.volume)),
                pitch: normalizeAudioPitchValue(String(values.pitch)),
                format: normalizeAudioFormatValue(initialValues.format),
            });
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };

    return <Modal open={open} title="重新生成全部音频" onCancel={onClose} onOk={() => void submit()} okText="生成全部新版本" cancelText="取消" destroyOnHidden width={520}>
        <p className="mb-5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5 text-sm leading-6 text-muted-foreground">将沿用每个片段当前的文案和语气指导，并为每个片段新增一个音频版本。</p>
        <Form form={form} layout="vertical" requiredMark={false}><AudioSettingsFields /></Form>
    </Modal>;
}
