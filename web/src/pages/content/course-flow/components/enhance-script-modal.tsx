import { Form, Input, Modal } from "antd";
import { useEffect } from "react";

export function EnhanceScriptModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (instruction: string) => void;
}) {
    const [form] = Form.useForm<{ instruction: string }>();

    useEffect(() => {
        if (open) form.resetFields();
    }, [form, open]);

    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit(values.instruction.trim());
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };

    return (
        <Modal open={open} title="优化课程文案" onCancel={onClose} onOk={() => void submit()} okText="开始优化" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="instruction" label="优化要求" rules={[{ required: true, whitespace: true, message: "请填写优化要求" }]}>
                    <Input.TextArea rows={6} placeholder="例如：增加适合小学生的生活类比，精简重复解释，并加强结尾总结。" autoFocus />
                </Form.Item>
                <p className="text-sm leading-6 text-muted-foreground">已有视频会保留；进入音频步骤时，文案有变化的片段会自动清空旧音频并重新生成。</p>
            </Form>
        </Modal>
    );
}
