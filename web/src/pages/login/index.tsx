import { App, Button, Form, Input } from "antd";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { signInWithUsername } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const status = useUserStore((state) => state.status);
    const refreshProfile = useUserStore((state) => state.refreshProfile);
    if (status === "authenticated") return <Navigate to="/" replace />;

    const submit = async (values: { username: string; password: string }) => {
        try {
            await signInWithUsername(values.username, values.password);
            const profile = await refreshProfile();
            if (!profile) return;
            navigate(profile.must_change_password ? "/change-password" : ((location.state as { from?: string } | null)?.from || "/"), { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <AuthShell title="CrocoTV 内部平台" description="使用内部账号登录" branded>
                <Form layout="vertical" onFinish={(values) => void submit(values)} requiredMark={false}>
                    <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}><Input autoFocus autoComplete="username" /></Form.Item>
                    <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}><Input.Password autoComplete="current-password" /></Form.Item>
                    <Button type="primary" htmlType="submit" block>登录</Button>
                </Form>
        </AuthShell>
    );
}
