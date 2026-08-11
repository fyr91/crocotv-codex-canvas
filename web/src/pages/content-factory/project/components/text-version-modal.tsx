import { Form, Input, Modal } from "antd";
import { useEffect } from "react";
import type { FactoryLayer } from "@/types/content-factory";

export function TextVersionModal({ open, layer, sectionLabel, initialValue, saving, onClose, onSave }: { open: boolean; layer: Extract<FactoryLayer, "script" | "visual_prompt">; sectionLabel: string; initialValue: string; saving: boolean; onClose: () => void; onSave: (value: string) => void }) {
    const [form] = Form.useForm<{ text: string }>();
    useEffect(() => { if (open) form.setFieldsValue({ text: initialValue }); }, [form, initialValue, open]);
    return (
        <Modal open={open} title={`编辑${layer === "script" ? "文案" : "画面提示词"} · ${sectionLabel}`} onCancel={onClose} okText="保存" cancelText="取消" confirmLoading={saving} onOk={() => void form.validateFields().then(({ text }) => onSave(text))}>
            <Form form={form} layout="vertical">
                <Form.Item name="text" label={layer === "script" ? "分段文案" : "画面提示词"} rules={[{ required: true, whitespace: true, message: "内容不能为空" }]} extra="保存后会创建新版本，并将依赖它的上层内容标记为需要重新生成。">
                    <Input.TextArea rows={10} showCount maxLength={10_000} autoFocus />
                </Form.Item>
            </Form>
        </Modal>
    );
}
