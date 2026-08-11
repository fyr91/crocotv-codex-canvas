import { Form, Input, Modal } from "antd";
import { useEffect } from "react";

export function InsertSegmentModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (instruction: string) => void }) {
    const [form] = Form.useForm<{ instruction: string }>();
    useEffect(() => { if (open) form.resetFields(); }, [form, open]);
    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit(values.instruction.trim());
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };
    return <Modal open={open} title="新增片段" okText="生成并插入" cancelText="取消" onCancel={onClose} onOk={() => void submit()} destroyOnHidden width={520}>
        <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="instruction" label="片段要求" rules={[{ required: true, whitespace: true, message: "请填写片段要求" }, { max: 500, message: "片段要求不能超过 500 个字符" }]}>
                <Input.TextArea aria-label="片段要求" rows={5} placeholder="例如：在这里补充一个生活化例子" />
            </Form.Item>
        </Form>
    </Modal>;
}
