import { App, Button, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useRef } from "react";

import { CONTENT_ORIENTATION_FIELDS, isContentOrientationComplete } from "@/lib/content-production/content-orientation";
import type { ContentTopicOrientation } from "@/types/content-production";

const defaults: ContentTopicOrientation = {
    contentGoal: "",
    targetAudience: "",
    marketLanguage: "",
    primaryPlatforms: [],
    contentFormat: "",
    defaultDurationSeconds: 60,
    defaultAspectRatio: "9:16",
    expressionStyle: "",
};

export function TopicOrientationForm({
    initialValue,
    saving,
    onSave,
    submitLabel = "保存内容方向",
    description = "这是当前 Owner、当前 Attempt 的制作方向，不会影响公共 Topic 池，也不会继承给下一位 Owner。",
    autosave = false,
    compact = false,
    onSubmit,
}: {
    initialValue?: ContentTopicOrientation | null;
    saving: boolean;
    onSave: (value: ContentTopicOrientation) => Promise<void>;
    submitLabel?: string;
    description?: string;
    autosave?: boolean;
    compact?: boolean;
    onSubmit?: (value: ContentTopicOrientation) => Promise<void>;
}) {
    const { message } = App.useApp();
    const [form] = Form.useForm<ContentTopicOrientation>();
    const autosaveTimer = useRef<number | null>(null);

    useEffect(() => {
        form.setFieldsValue(initialValue || defaults);
    }, [form, initialValue]);
    useEffect(() => () => {
        if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    }, []);

    const submit = async (value: ContentTopicOrientation) => {
        try {
            if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
            if (onSubmit) await onSubmit(value);
            else await onSave(value);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "内容 Orientation 保存失败");
        }
    };

    return (
        <div className={compact ? "w-full" : "w-full max-w-3xl rounded-2xl border border-border bg-background p-6 shadow-sm"}>
            <div className="mb-6">
                <h2 className="font-semibold">定义当前 Topic 的内容 Orientation</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            <Form<ContentTopicOrientation>
                form={form}
                layout="vertical"
                requiredMark={false}
                onFinish={(value) => void submit(value)}
                onValuesChange={() => {
                    if (!autosave) return;
                    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
                    autosaveTimer.current = window.setTimeout(() => {
                        const value = form.getFieldsValue(true);
                        if (isContentOrientationComplete(value)) void onSave(value);
                    }, 500);
                }}
                className="flex flex-col"
            >
                <Form.Item name="contentGoal" label={fieldLabel("contentGoal")} rules={[{ required: true, whitespace: true, message: "请填写内容目标" }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={sample("contentGoal")} />
                </Form.Item>
                <Form.Item name="targetAudience" label={fieldLabel("targetAudience")} rules={[{ required: true, whitespace: true, message: "请填写目标受众" }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={sample("targetAudience")} />
                </Form.Item>
                <Form.Item name="marketLanguage" label={fieldLabel("marketLanguage")} rules={[{ required: true, whitespace: true, message: "请填写市场与语言" }]}>
                    <Input placeholder={sample("marketLanguage")} />
                </Form.Item>
                <Form.Item name="primaryPlatforms" label={fieldLabel("primaryPlatforms")} rules={[{ required: true, type: "array", min: 1, message: "至少填写一个主要平台" }]}>
                    <Select mode="tags" tokenSeparators={[",", "，"]} placeholder={sample("primaryPlatforms")} />
                </Form.Item>
                <Form.Item name="contentFormat" label={fieldLabel("contentFormat")} rules={[{ required: true, whitespace: true, message: "请填写内容形式" }]}>
                    <Input placeholder={sample("contentFormat")} />
                </Form.Item>
                <Form.Item name="expressionStyle" label={fieldLabel("expressionStyle")} rules={[{ required: true, whitespace: true, message: "请填写表达风格" }]}>
                    <Input placeholder={sample("expressionStyle")} />
                </Form.Item>
                <Form.Item name="defaultDurationSeconds" label={fieldLabel("defaultDurationSeconds")} rules={[{ required: true, message: "请填写目标时长" }]}>
                    <div className="w-full [&_.ant-space-compact]:w-full">
                        <InputNumber min={1} max={3600} addonAfter="秒" className="w-full" />
                    </div>
                </Form.Item>
                <Form.Item name="defaultAspectRatio" label={fieldLabel("defaultAspectRatio")} rules={[{ required: true, message: "请选择目标画幅" }]}>
                    <Select options={["9:16", "16:9", "1:1", "4:5"].map((value) => ({ value, label: value }))} />
                </Form.Item>
                <div className="w-full">
                    <Button type="primary" htmlType="submit" loading={saving} block>{submitLabel}</Button>
                </div>
            </Form>
        </div>
    );
}

function definition(name: (typeof CONTENT_ORIENTATION_FIELDS)[number]["name"]) {
    return CONTENT_ORIENTATION_FIELDS.find((field) => field.name === name)!;
}

function fieldLabel(name: (typeof CONTENT_ORIENTATION_FIELDS)[number]["name"]) {
    const field = definition(name);
    return (
        <span className="block">
            <span className="block">{field.label}</span>
            <small className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{field.description}</small>
        </span>
    );
}

function sample(name: (typeof CONTENT_ORIENTATION_FIELDS)[number]["name"]) {
    return `示例：${definition(name).sample}`;
}
