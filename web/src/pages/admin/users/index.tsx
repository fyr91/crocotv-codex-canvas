import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import { useEffect, useState } from "react";

import { listAdminUsers, manageUser, type AdminUser } from "@/services/api/admin-users";
import { useCopyText } from "@/hooks/use-copy-text";
import { AdminPage } from "@/components/layout/page-shell";

type Credentials = { username: string; password: string };

export default function AdminUsersPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [credentials, setCredentials] = useState<Credentials | null>(null);
    const [form] = Form.useForm();
    const load = async () => { setLoading(true); try { setUsers(await listAdminUsers()); } catch (error) { message.error(error instanceof Error ? error.message : "用户加载失败"); } finally { setLoading(false); } };
    useEffect(() => { void load(); }, []);
    const action = async (body: Record<string, unknown>) => { try { await manageUser(body); await load(); message.success("操作成功"); } catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); } };
    const resetPassword = async (item: AdminUser, copyImmediately = false) => { try { const data = await manageUser({ action: "reset-password", userId: item.id }); const nextCredentials = { username: item.username, password: data.temporaryPassword }; if (copyImmediately) copyText(formatCredentials(nextCredentials), "用户名和临时密码已复制"); else setCredentials(nextCredentials); await load(); if (!copyImmediately) message.success("操作成功"); } catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); } };
    const create = async () => { const values = await form.validateFields(); const data = await manageUser({ action: "create", ...values }); setCreateOpen(false); form.resetFields(); setCredentials({ username: data.username, password: data.temporaryPassword }); await load(); };
    return (
        <AdminPage title="用户管理" description="创建内部账号、重置密码并管理账号状态" actions={<Button type="primary" onClick={() => setCreateOpen(true)}>创建用户</Button>}>
            <Table rowKey="id" loading={loading} dataSource={users} pagination={{ pageSize: 20 }} columns={[
                { title: "用户", render: (_, item) => <div><div className="font-medium">{item.display_name || item.username}</div><div className="text-xs text-stone-500">{item.username}</div></div> },
                { title: "角色", dataIndex: "role", render: (value) => <Tag>{value === "superuser" ? "超级管理员" : "普通用户"}</Tag> },
                { title: "状态", dataIndex: "status", render: (value) => <Tag color={value === "active" ? "green" : "red"}>{value === "active" ? "启用" : "停用"}</Tag> },
                { title: "首次改密", dataIndex: "must_change_password", render: (value) => value ? "待修改" : "已完成" },
                { title: "操作", render: (_, item) => <Space wrap>
                    <Button size="small" onClick={() => void resetPassword(item)}>重置密码</Button>
                    <Button size="small" onClick={() => void resetPassword(item, true)}>重置并复制</Button>
                    <Button size="small" onClick={() => void action({ action: "set-role", userId: item.id, role: item.role === "superuser" ? "user" : "superuser" })}>{item.role === "superuser" ? "设为普通用户" : "设为管理员"}</Button>
                    <Popconfirm title={`确认${item.status === "active" ? "停用" : "启用"}该账号？`} onConfirm={() => void action({ action: "set-status", userId: item.id, status: item.status === "active" ? "disabled" : "active" })}><Button size="small" danger={item.status === "active"}>{item.status === "active" ? "停用" : "启用"}</Button></Popconfirm>
                </Space> },
            ]} />
            <Modal title="创建内部用户" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void create()} okText="创建"><Form form={form} layout="vertical"><Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="displayName" label="显示名称"><Input /></Form.Item><Form.Item name="role" label="角色" initialValue="user"><Select options={[{ value: "user", label: "普通用户" }, { value: "superuser", label: "超级管理员" }]} /></Form.Item></Form></Modal>
            <Modal title="一次性临时账密" open={Boolean(credentials)} onCancel={() => setCredentials(null)} footer={<Button type="primary" onClick={() => { if (!credentials) return; copyText(formatCredentials(credentials), "用户名和临时密码已复制"); setCredentials(null); }}>复制并关闭</Button>}><div className="space-y-3"><Input addonBefore="用户" value={credentials?.username || ""} readOnly /><Input addonBefore="密码" value={credentials?.password || ""} readOnly /></div><p className="mt-3 text-sm text-stone-500">关闭后无法再次查看，请立即安全地交给用户。</p></Modal>
        </AdminPage>
    );
}

function formatCredentials({ username, password }: Credentials) {
    return `用户：${username}\n密码：${password}`;
}
