import { App, Button, Form, Input, Modal, Segmented, Space, Table, Tag } from "antd";
import { Eye, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listAdminCanvasTemplates, reviewCanvasTemplate, updateCanvasTemplateMetadata, type CanvasTemplate, type CanvasTemplateStatus } from "@/services/api/canvas-templates";
import { useUserStore } from "@/stores/use-user-store";
import { AdminPage } from "@/components/layout/page-shell";

type Filter = "all" | CanvasTemplateStatus;
const labels: Record<CanvasTemplateStatus, { text: string; color?: string }> = {
    pending: { text: "待审核", color: "gold" },
    published: { text: "已发布", color: "green" },
    rejected: { text: "已驳回", color: "red" },
    withdrawn: { text: "已撤回" },
};

export default function AdminTemplatesPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const profile = useUserStore((state) => state.profile);
    const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
    const [filter, setFilter] = useState<Filter>("pending");
    const [loading, setLoading] = useState(true);
    const [rejecting, setRejecting] = useState<CanvasTemplate | null>(null);
    const [reason, setReason] = useState("");
    const [editing, setEditing] = useState<CanvasTemplate | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm] = Form.useForm<{ title: string; description: string }>();

    const load = async () => {
        setLoading(true);
        try { setTemplates(await listAdminCanvasTemplates()); }
        catch (error) { message.error(error instanceof Error ? error.message : "模板审核列表加载失败"); }
        finally { setLoading(false); }
    };
    useEffect(() => { void load(); }, []);
    const rows = useMemo(() => filter === "all" ? templates : templates.filter((template) => template.status === filter), [filter, templates]);
    const review = async (template: CanvasTemplate, action: "approve" | "reject") => {
        if (!profile) return;
        if (action === "reject" && !reason.trim()) return message.warning("请填写驳回原因");
        try {
            await reviewCanvasTemplate({ id: template.id, reviewerId: profile.id, action, reason });
            message.success(action === "approve" ? "模板已发布" : "模板已驳回");
            setRejecting(null);
            setReason("");
            await load();
        } catch (error) { message.error(error instanceof Error ? error.message : "审核操作失败"); }
    };
    const openEditor = (template: CanvasTemplate) => {
        setEditing(template);
        editForm.setFieldsValue({ title: template.title, description: template.description });
    };
    const saveMetadata = async () => {
        if (!editing) return;
        const values = await editForm.validateFields();
        setSaving(true);
        try {
            await updateCanvasTemplateMetadata({ id: editing.id, ...values });
            message.success("模板信息已更新");
            setEditing(null);
            await load();
        } catch (error) { message.error(error instanceof Error ? error.message : "模板信息更新失败"); }
        finally { setSaving(false); }
    };

    return (
        <AdminPage title="模板审核" description="审核普通用户提交的画布快照；管理员自己的提交会直接发布。" actions={<Button type="text" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>刷新</Button>}>
            <Segmented<Filter> className="mb-5" value={filter} onChange={setFilter} options={[{ label: "待审核", value: "pending" }, { label: "已发布", value: "published" }, { label: "已驳回", value: "rejected" }, { label: "已撤回", value: "withdrawn" }, { label: "全部", value: "all" }]} />
            <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 20 }} columns={[
                { title: "模板", render: (_: unknown, item: CanvasTemplate) => <div><div className="font-medium">{item.title}</div><div className="mt-1 max-w-md truncate text-xs text-stone-500">{item.description || "无说明"}</div></div> },
                { title: "提交人", dataIndex: "creatorName", width: 140 },
                { title: "节点", width: 80, render: (_: unknown, item: CanvasTemplate) => item.document.nodes?.length || 0 },
                { title: "状态", width: 100, render: (_: unknown, item: CanvasTemplate) => <Tag color={labels[item.status].color}>{labels[item.status].text}</Tag> },
                { title: "提交时间", dataIndex: "createdAt", width: 170, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
                { title: "操作", width: 300, render: (_: unknown, item: CanvasTemplate) => <Space wrap><Button size="small" type="text" icon={<Eye className="size-4" />} onClick={() => navigate(`/canvas/${item.id}?template-preview=1`)}>预览</Button><Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={() => openEditor(item)} aria-label="编辑模板" title="编辑模板">编辑</Button>{item.status === "pending" ? <><Button size="small" type="text" onClick={() => void review(item, "approve")}>通过</Button><Button size="small" type="text" danger onClick={() => { setRejecting(item); setReason(""); }}>驳回</Button></> : null}</Space> },
            ]} />
            <Modal title="编辑模板" open={Boolean(editing)} confirmLoading={saving} okText="保存" cancelText="取消" onCancel={() => setEditing(null)} onOk={() => void saveMetadata()} destroyOnHidden>
                <Form form={editForm} layout="vertical" className="pt-2">
                    <Form.Item name="title" label="模板标题" rules={[{ required: true, message: "请输入模板标题" }, { max: 80, message: "标题最多 80 个字符" }]}><Input maxLength={80} showCount /></Form.Item>
                    <Form.Item name="description" label="模板说明" rules={[{ max: 500, message: "说明最多 500 个字符" }]}><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
                </Form>
            </Modal>
            <Modal title="驳回模板" open={Boolean(rejecting)} okText="确认驳回" okButtonProps={{ danger: true }} onCancel={() => setRejecting(null)} onOk={() => rejecting && void review(rejecting, "reject")}><p className="mb-3 text-sm text-stone-500">驳回原因会展示给提交者。</p><Input.TextArea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} showCount placeholder="请说明需要修改的内容" /></Modal>
        </AdminPage>
    );
}
