import { App, Button, Form, Modal } from "antd";
import { useEffect } from "react";

import { useCreateContentTopicMutation } from "../use-content-production";

import { TopicCreateForm, type TopicCreateValues } from "./topic-create-form";

export function TopicCreateModal({ open, onClose, onClaimed }: { open: boolean; onClose: () => void; onClaimed: (topicId: string) => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<TopicCreateValues>();
    const mutation = useCreateContentTopicMutation();

    useEffect(() => {
        if (open) form.resetFields();
    }, [form, open]);

    const submit = async () => {
        const values = await form.validateFields();
        try {
            const result = await mutation.mutateAsync({
                title: values.title,
                originalTopic: values.originalTopic,
                creationNotes: values.creationNotes || "",
                tags: values.tags || [],
                sourceType: "member",
                sourceAssetId: null,
                sourceInspirationId: null,
                claim: values.claim,
            });
            message.success(values.claim ? "Topic 已创建并领取" : "Topic 已加入公共池");
            onClose();
            if (result.claimed) onClaimed(result.topicId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Topic 创建失败");
        }
    };

    return (
        <Modal
            open={open}
            title="创建 Topic"
            onCancel={onClose}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="submit" type="primary" loading={mutation.isPending} onClick={submit}>提交</Button>,
            ]}
            destroyOnHidden
        >
            <TopicCreateForm form={form} claimMode="choice" />
        </Modal>
    );
}
