import { Spin } from "antd";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useUserStore } from "@/stores/use-user-store";

export function AuthGuard() {
    const location = useLocation();
    const status = useUserStore((state) => state.status);
    const profile = useUserStore((state) => state.profile);

    if (status === "loading") return <div className="flex h-dvh items-center justify-center bg-background"><Spin size="large" /></div>;
    if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    if (profile?.must_change_password && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
    return <Outlet />;
}
