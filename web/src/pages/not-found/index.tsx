import { Home } from "lucide-react";
import { Button } from "antd";

import { SystemState } from "@/components/layout/system-state";

export default function NotFound() {
    return (
        <SystemState
            patterned
            icon={<span className="text-2xl font-semibold">404</span>}
            title="页面不存在"
            description="这个地址没有对应的页面，可能已经移动或被合并到其他入口。"
            actions={<Button type="primary" href="/" icon={<Home className="size-4" />}>返回首页</Button>}
        />
    );
}
