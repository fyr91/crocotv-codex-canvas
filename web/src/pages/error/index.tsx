import { Home, RefreshCw } from "lucide-react";
import { Button } from "antd";

import { SystemState } from "@/components/layout/system-state";

export default function RouteErrorPage() {
    return (
        <SystemState
            icon={<RefreshCw className="size-6" />}
            title="页面暂时无法打开"
            description="应用可能刚完成更新，或网络暂时不稳定。重新加载后会获取最新页面资源。"
            actions={
                <>
                    <Button type="primary" icon={<RefreshCw className="size-4" />} onClick={() => window.location.reload()}>重新加载</Button>
                    <Button href="/" icon={<Home className="size-4" />}>返回首页</Button>
                </>
            }
        />
    );
}
