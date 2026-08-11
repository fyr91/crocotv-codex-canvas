import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Form, Input, Modal, Radio, Select, Skeleton, Steps } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { configureContentFactoryProject, generateContentFactoryScript, getContentFactoryRoles, initializeContentFactoryProject } from "@/services/api/content-factory";

type Brief = { title: string; topic: string; audience: string; durationText: string; extraPrompt: string; aspectRatio: string };

export function CreateVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const roles = useQuery({ queryKey: ["content-factory-roles"], queryFn: getContentFactoryRoles, enabled: open });
    const [step, setStep] = useState(0);
    const [roleId, setRoleId] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm<Brief>();
    const close = () => { setStep(0); setRoleId(""); form.resetFields(); onClose(); };
    const create = async () => {
        const values = await form.validateFields();
        const projectId = crypto.randomUUID();
        setSubmitting(true);
        try {
            await initializeContentFactoryProject(projectId, crypto.randomUUID());
            await configureContentFactoryProject(projectId, { title: values.title, roleId, durationText: values.durationText });
            await generateContentFactoryScript(projectId, values);
            close();
            navigate(`/content-factory/${projectId}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频项目创建失败");
        } finally { setSubmitting(false); }
    };
    return (
        <Modal open={open} onCancel={close} footer={null} width={680} destroyOnHidden title="添加视频">
            <Steps size="small" current={step} items={[{ title: "选择角色" }, { title: "视频内容" }]} className="mb-7" />
            {step === 0 ? (
                <div>
                    <p className="mb-3 text-sm text-muted-foreground">选择本次视频使用的已有角色和声音。</p>
                    {roles.isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
                    {roles.isError ? <Alert type="error" showIcon message="角色读取失败" action={<Button size="small" onClick={() => void roles.refetch()}>重试</Button>} /> : null}
                    {!roles.isLoading && !roles.isError ? <Radio.Group value={roleId} onChange={(event) => setRoleId(event.target.value)} className="grid w-full gap-3 sm:grid-cols-2">
                        {(roles.data || []).map((role) => (
                            <Radio.Button key={role.id} value={role.id} className="!flex !h-auto !min-h-20 !items-center !rounded-xl !border !px-4 !py-3">
                                <span className="block font-medium">{role.name}</span>
                                <span className="mt-1 block text-xs text-muted-foreground">{role.voice_name}{role.description ? ` · ${role.description}` : ""}</span>
                            </Radio.Button>
                        ))}
                    </Radio.Group> : null}
                    {!roles.isLoading && !roles.isError && !roles.data?.length ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">暂时没有可选择的角色，请先在课程视频中配置角色。</div> : null}
                    <div className="mt-7 flex justify-end gap-2"><Button onClick={close}>取消</Button><Button type="primary" disabled={!roleId} onClick={() => setStep(1)}>下一步</Button></div>
                </div>
            ) : (
                <Form form={form} layout="vertical" initialValues={{ aspectRatio: "16:9", extraPrompt: "" }} onFinish={() => void create()}>
                    <Form.Item name="title" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }]}><Input placeholder="例如：生成式 AI 入门" /></Form.Item>
                    <Form.Item name="topic" label="视频内容" rules={[{ required: true, message: "请输入视频内容" }]}><Input.TextArea rows={4} placeholder="描述要讲解的主题、核心观点与内容范围" /></Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="audience" label="针对人群" rules={[{ required: true, message: "请输入目标人群" }]}><Input placeholder="例如：非技术岗位的职场新人" /></Form.Item>
                        <Form.Item name="durationText" label="期望时长" rules={[{ required: true, message: "请输入期望时长" }]}><Input placeholder="例如：约 3 分钟" /></Form.Item>
                    </div>
                    <Form.Item name="aspectRatio" label="画面比例"><Select options={[{ value: "16:9", label: "16:9 横屏" }, { value: "9:16", label: "9:16 竖屏" }, { value: "4:3", label: "4:3" }]} /></Form.Item>
                    <Form.Item name="extraPrompt" label="补充提示词"><Input.TextArea rows={3} placeholder="例如：语气轻松、案例贴近日常工作、避免过度技术化" /></Form.Item>
                    <div className="flex justify-end gap-2"><Button onClick={() => setStep(0)}>上一步</Button><Button type="primary" htmlType="submit" loading={submitting}>生成分段文案</Button></div>
                </Form>
            )}
        </Modal>
    );
}
