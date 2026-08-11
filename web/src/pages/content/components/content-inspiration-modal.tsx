import { App, Checkbox, Form, Input, Modal } from "antd";
import { useEffect, useState } from "react";

import { buildInspirationTopicInput, validateInspirationNotes } from "@/lib/content-production/content-inspiration";
import { createContentInspiration, createContentTopic } from "@/services/api/content-production";
import type { Asset } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";

export function ContentInspirationModal({ asset, open, onClose }: { asset: Pick<Asset, "id" | "title" | "note"> | null; open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const userId = useUserStore((state) => state.profile?.id || "");
    const [form] = Form.useForm<{ notes: string; createTopic: boolean }>();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) form.setFieldsValue({ notes: asset?.note || "", createTopic: true });
    }, [asset?.note, form, open]);

    const submit = async () => {
        if (!asset || !userId) return;
        setSaving(true);
        try {
            const values = await form.validateFields();
            const notes = validateInspirationNotes(values.notes);
            const inspiration = await createContentInspiration({ sourceAssetId: asset.id, markedBy: userId, notes });
            if (values.createTopic) {
                await createContentTopic(buildInspirationTopicInput({
                    assetId: asset.id,
                    inspirationId: inspiration.id,
                    assetTitle: asset.title,
                    notes,
                }));
            }
            message.success(values.createTopic ? "已加入灵感并投放到公共 Topic 池" : "已加入团队灵感");
            onClose();
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={`作为灵感 · ${asset?.title || ""}`} open={open} onCancel={onClose} onOk={() => void submit()} okText="保存灵感" cancelText="取消" confirmLoading={saving} destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item
                    name="notes"
                    label="为什么上传 / 这份素材哪里值得参考"
                    rules={[{ required: true, whitespace: true, message: "请说明为什么把这个素材作为灵感" }]}
                    extra="例如：这个儿童音乐 MV 的互动副歌、镜头节奏和角色出场方式值得形成新的内容形式。"
                >
                    <Input.TextArea rows={6} placeholder="描述希望 AI 重点理解和衍生的内容" />
                </Form.Item>
                <Form.Item name="createTopic" valuePropName="checked">
                    <Checkbox>同时创建一个公共 Topic（无需预审）</Checkbox>
                </Form.Item>
            </Form>
        </Modal>
    );
}
