import { Result } from "antd";
import { Outlet } from "react-router-dom";

import { useUserStore } from "@/stores/use-user-store";

export function SuperuserGuard() {
    const profile = useUserStore((state) => state.profile);
    return profile?.role === "superuser" ? <Outlet /> : <Result status="403" title="无权访问" subTitle="此页面仅供超级管理员使用" />;
}
