import { App, Button, Form, Input } from "antd";
import { useNavigate } from "react-router-dom";

import { changePassword } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ChangePasswordPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const refreshProfile = useUserStore((state) => state.refreshProfile);
    const submit = async (values: { password: string }) => {
        try {
            await changePassword(values.password);
            await refreshProfile();
            message.success("密码已更新");
            navigate("/", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "密码更新失败");
        }
    };
    return (
        <AuthShell title="首次登录，请修改密码" description="新密码至少 8 位，并包含大小写字母、数字和符号。">
                <Form layout="vertical" onFinish={(values) => void submit(values)} requiredMark={false}>
                    <Form.Item label="新密码" name="password" rules={[{ required: true }, { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/, message: "密码强度不足" }]}><Input.Password autoComplete="new-password" /></Form.Item>
                    <Form.Item label="确认新密码" name="confirm" dependencies={["password"]} rules={[{ required: true }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("两次密码不一致")); } })]}><Input.Password autoComplete="new-password" /></Form.Item>
                    <Button type="primary" htmlType="submit" block>保存并进入平台</Button>
                </Form>
        </AuthShell>
    );
}
