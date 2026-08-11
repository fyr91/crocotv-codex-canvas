import { AppConfigPanel } from "@/components/layout/app-config-modal";
import { AdminPage } from "@/components/layout/page-shell";

export default function ConfigPage() {
    return (
        <AdminPage title="配置" description="选择管理员启用的全局模型" width="6xl">
            <AppConfigPanel />
        </AdminPage>
    );
}
