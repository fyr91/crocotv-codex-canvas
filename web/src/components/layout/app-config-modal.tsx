import { Alert, App, Button, Form, Modal, Tabs } from "antd";
import { Link } from "react-router-dom";

import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, type ConfigTabKey, type ModelCapability, type ProviderCatalogModel } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

const groups: Array<{ capability: ModelCapability; providerCapability?: ProviderCatalogModel["capability"]; key: "imageModel" | "videoModel" | "textModel" | "speechModel" | "musicModel"; label: string }> = [
    { capability: "image", key: "imageModel", label: "默认生图模型" },
    { capability: "video", key: "videoModel", label: "默认视频模型" },
    { capability: "text", key: "textModel", label: "默认文本模型" },
    { capability: "audio", providerCapability: "speech", key: "speechModel", label: "默认语音模型" },
    { capability: "audio", providerCapability: "music", key: "musicModel", label: "默认音乐模型" },
];

export function AppConfigPanel({ showDoneButton = false }: { showDoneButton?: boolean; initialTab?: ConfigTabKey }) {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const close = useConfigStore((state) => state.setConfigDialogOpen);
    const profile = useUserStore((state) => state.profile);
    const finish = () => {
        close(false);
        message.success("配置已保存");
    };

    return (
        <>
            <Tabs activeKey="models" items={[
                {
                    key: "models",
                    label: "默认模型",
                    children: (
                        <div className="grid gap-4 py-2 sm:grid-cols-2">
                            {groups.map((group) => (
                                <Form.Item key={group.key} label={group.label} className="mb-0">
                                    <ModelPicker config={config} value={config[group.key]} capability={group.capability} providerCapability={group.providerCapability} onChange={(value) => updateConfig(group.key, value)} fullWidth />
                                </Form.Item>
                            ))}
                            {!config.models.length && <Alert className="sm:col-span-2" type="info" showIcon message="暂时没有可用模型，请联系超级管理员完成全局服务配置。" />}
                            {profile?.role === "superuser" && <Link to="/admin/providers" onClick={() => close(false)}>前往全局 AI 服务配置</Link>}
                        </div>
                    ),
                },
            ]} />
            {showDoneButton && <div className="mt-5 flex justify-end"><Button type="primary" onClick={finish}>完成</Button></div>}
        </>
    );
}

export function AppConfigModal() {
    const open = useConfigStore((state) => state.isConfigOpen);
    const setOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal title="配置" open={open} width={760} centered footer={null} onCancel={() => setOpen(false)}>
            <AppConfigPanel showDoneButton />
        </Modal>
    );
}
