import { Form, Input, Modal } from "antd";
import { useEffect } from "react";

export function SegmentRegenerationModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (direction: string) => void;
}) {
    const [form] = Form.useForm<{ direction: string }>();

    useEffect(() => {
        if (open) form.resetFields();
    }, [form, open]);

    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit(values.direction.trim());
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };

    return (
        <Modal open={open} title="重新生成课程片段" onCancel={onClose} onOk={() => void submit()} okText="重新生成片段" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="direction" label="本次优化方向" rules={[{ required: true, whitespace: true, message: "请输入本次优化方向" }]}>
                    <Input.TextArea rows={5} placeholder="例如：讲得更生动，增加贴近日常生活的类比，并精简重复解释。" autoFocus />
                </Form.Item>
                <p className="text-sm leading-6 text-muted-foreground">只会重新生成当前片段的文案与语气指导；生成失败时会保留原内容。</p>
            </Form>
        </Modal>
    );
}
