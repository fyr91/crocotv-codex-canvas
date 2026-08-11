import { Checkbox, Form, Input, Modal } from "antd";
import { useEffect } from "react";

export type CourseSceneRegenerationInput = {
    instruction: string;
    referenceCurrentScene: boolean;
};

export function SceneRegenerationModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (input: CourseSceneRegenerationInput) => void;
}) {
    const [form] = Form.useForm<CourseSceneRegenerationInput>();

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        form.setFieldsValue({ instruction: "", referenceCurrentScene: true });
    }, [form, open]);

    const submit = async () => {
        try {
            const values = await form.validateFields();
            onSubmit({ instruction: values.instruction.trim(), referenceCurrentScene: values.referenceCurrentScene });
        } catch {
            // Ant Design keeps validation feedback next to the field.
        }
    };

    return (
        <Modal open={open} title="重新生成课程场景" onCancel={onClose} onOk={() => void submit()} okText="生成场景" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="instruction" label="本次调整要求" rules={[{ required: true, whitespace: true, message: "请输入本次调整要求" }]}>
                    <Input.TextArea rows={5} placeholder="描述希望保留或调整的画面内容" autoFocus />
                </Form.Item>
                <Form.Item name="referenceCurrentScene" valuePropName="checked" extra="勾选后将把当前场景图作为参考，尽量保留未要求改变的部分。">
                    <Checkbox>参考当前场景图进行优化</Checkbox>
                </Form.Item>
            </Form>
        </Modal>
    );
}
