import { App, Form, Input, Modal } from "antd";
import { useEffect, useState } from "react";

import { resubmitCanvasTemplate, submitCanvasTemplate, type CanvasTemplate } from "@/services/api/canvas-templates";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { UserProfile } from "@/stores/use-user-store";

export function CanvasTemplateSubmitModal({ open, project, profile, template, onCancel, onSuccess }: { open: boolean; project: CanvasProject | null; profile: UserProfile | null; template?: CanvasTemplate | null; onCancel: () => void; onSuccess: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<{ title: string; description: string }>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open || !project) return;
        form.setFieldsValue({ title: template?.title || project.title, description: template?.description || "" });
    }, [form, open, project?.id, template?.id]);

    const submit = async () => {
        if (!project || !profile) return message.error("当前账户或画布状态无效");
        const values = await form.validateFields();
        setSubmitting(true);
        try {
            if (template) await resubmitCanvasTemplate({ templateId: template.id, project, ...values });
            else await submitCanvasTemplate({ project, profile, ...values });
            message.success(template ? "已重新提交审核" : profile.role === "superuser" ? "模板已发布" : "已提交审核");
            onSuccess();
            onCancel();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "模板提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={template ? "重新提交模板" : "提交为模板"} open={open} confirmLoading={submitting} okText={template ? "重新提交" : profile?.role === "superuser" ? "发布模板" : "提交审核"} cancelText="取消" onCancel={onCancel} onOk={() => void submit()} destroyOnHidden>
            <Form form={form} layout="vertical" className="pt-2">
                <Form.Item name="title" label="模板标题" rules={[{ required: true, message: "请输入模板标题" }, { max: 80, message: "标题最多 80 个字符" }]}><Input placeholder="例如：产品短片制作流程" /></Form.Item>
                <Form.Item name="description" label="模板说明" rules={[{ max: 500, message: "说明最多 500 个字符" }]}><Input.TextArea rows={4} showCount maxLength={500} placeholder="说明模板适用的场景和使用方式" /></Form.Item>
            </Form>
        </Modal>
    );
}
