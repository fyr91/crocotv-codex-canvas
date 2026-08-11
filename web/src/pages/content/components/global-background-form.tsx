import { App, Button, Card, Descriptions, Form, Input, InputNumber, Select, Space, Tag } from "antd";
import { useState } from "react";

import { CONTENT_BACKGROUND_FIELDS } from "@/lib/content-production/content-background";
import { updateContentGlobalSettings } from "@/services/api/content-production";
import type { ContentGlobalSettings } from "@/types/content-production";

type BackgroundValues = Omit<ContentGlobalSettings, "version" | "updatedAt">;

export function GlobalBackgroundForm({ settings, editable, userId, onSaved }: { settings: ContentGlobalSettings; editable: boolean; userId: string; onSaved: () => void }) {
    const { message } = App.useApp();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const save = async (values: BackgroundValues) => {
        setSaving(true);
        try {
            await updateContentGlobalSettings(values, userId);
            message.success("全局内容背景已保存，仅影响之后创建的 Topic");
            setEditing(false);
            onSaved();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <Card
                className="mb-6"
                title={<span className="text-base">全局内容背景</span>}
                extra={editable ? <Button type="text" onClick={() => setEditing(true)}>编辑</Button> : null}
            >
                <Descriptions column={{ xs: 1, sm: 2, lg: 4 }} size="small">
                    <Descriptions.Item label="内容目标">{settings.contentGoal || "尚未填写"}</Descriptions.Item>
                    <Descriptions.Item label="目标受众">{settings.targetAudience || "尚未填写"}</Descriptions.Item>
                    <Descriptions.Item label="市场与语言">{settings.marketLanguage || "尚未填写"}</Descriptions.Item>
                    <Descriptions.Item label="主要平台"><Space size={4} wrap>{settings.primaryPlatforms.map((item) => <Tag key={item}>{item}</Tag>)}{!settings.primaryPlatforms.length ? "尚未填写" : null}</Space></Descriptions.Item>
                    <Descriptions.Item label="内容形式">{settings.contentFormat || "尚未填写"}</Descriptions.Item>
                    <Descriptions.Item label="默认时长">{settings.defaultDurationSeconds} 秒</Descriptions.Item>
                    <Descriptions.Item label="默认画幅">{settings.defaultAspectRatio}</Descriptions.Item>
                    <Descriptions.Item label="表达风格">{settings.expressionStyle || "尚未填写"}</Descriptions.Item>
                </Descriptions>
            </Card>
        );
    }

    return (
        <Card className="mb-6" title="编辑全局内容背景">
            <Form<BackgroundValues>
                layout="vertical"
                initialValues={settings}
                onFinish={save}
                requiredMark={false}
                className="grid gap-x-5 md:grid-cols-2"
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
                <Form.Item name="defaultDurationSeconds" label={fieldLabel("defaultDurationSeconds")} rules={[{ required: true, message: "请填写默认时长" }]}>
                    <InputNumber min={1} max={3600} addonAfter="秒" className="w-full" />
                </Form.Item>
                <Form.Item name="defaultAspectRatio" label={fieldLabel("defaultAspectRatio")} rules={[{ required: true, message: "请选择默认画幅" }]}>
                    <Select options={["9:16", "16:9", "1:1", "4:5"].map((value) => ({ value, label: value }))} />
                </Form.Item>
                <div className="md:col-span-2 flex justify-end gap-2">
                    <Button onClick={() => setEditing(false)}>取消</Button>
                    <Button type="primary" htmlType="submit" loading={saving}>保存背景</Button>
                </div>
            </Form>
        </Card>
    );
}

function definition(name: (typeof CONTENT_BACKGROUND_FIELDS)[number]["name"]) {
    return CONTENT_BACKGROUND_FIELDS.find((field) => field.name === name)!;
}

function fieldLabel(name: (typeof CONTENT_BACKGROUND_FIELDS)[number]["name"]) {
    const field = definition(name);
    return <span>{field.label}<span className="ml-2 text-xs font-normal text-stone-400">{field.description}</span></span>;
}

function sample(name: (typeof CONTENT_BACKGROUND_FIELDS)[number]["name"]) {
    return `示例：${definition(name).sample}`;
}
