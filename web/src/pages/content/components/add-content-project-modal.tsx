import { App, Button, Empty, Form, Input, Modal, Skeleton } from "antd";
import { FileText, GraduationCap, Mic2, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { buildVideoInitializationPath } from "@/lib/koubo-video/initialization";
import type { ContentVideoWorkflowType } from "@/types/content-production";
import { useClaimContentTopicMutation, useContentTopicsQuery, useCreateContentTopicMutation } from "../use-content-production";
import { TopicCreateForm, topicCreateInitialValues, type TopicCreateValues } from "./topic-create-form";

type Step = "workflow" | "topic-source" | "topic-pool" | "topic-create";

export function AddContentProjectModal({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (path: string) => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<TopicCreateValues>();
    const [step, setStep] = useState<Step>("workflow");
    const [search, setSearch] = useState("");
    const [selectedTopicId, setSelectedTopicId] = useState("");
    const topics = useContentTopicsQuery({ status: "pool", search });
    const claim = useClaimContentTopicMutation();
    const createTopic = useCreateContentTopicMutation();
    const pending = claim.isPending || createTopic.isPending;

    const reset = () => {
        setStep("workflow");
        setSearch("");
        setSelectedTopicId("");
        form.resetFields();
    };
    useEffect(() => {
        if (open) {
            reset();
            form.setFieldsValue(topicCreateInitialValues);
        }
    }, [form, open]);
    const close = () => {
        reset();
        onClose();
    };
    const openPath = (path: string) => {
        close();
        onOpened(path);
    };
    const createVideo = (workflowType: ContentVideoWorkflowType) => {
        openPath(buildVideoInitializationPath(workflowType, crypto.randomUUID(), crypto.randomUUID()));
    };
    const claimTopic = async () => {
        if (!selectedTopicId) return;
        try {
            await claim.mutateAsync(selectedTopicId);
            message.success("Topic 已领取");
            openPath(`/content/topics/${selectedTopicId}`);
        } catch (error) {
            setSelectedTopicId("");
            void topics.refetch();
            message.error(error instanceof Error ? error.message : "Topic 领取失败");
        }
    };
    const createAndOpenTopic = async () => {
        const values = await form.validateFields();
        try {
            const result = await createTopic.mutateAsync({
                title: values.title,
                originalTopic: values.originalTopic,
                creationNotes: values.creationNotes || "",
                tags: values.tags || [],
                sourceType: "member",
                sourceAssetId: null,
                sourceInspirationId: null,
                claim: true,
            });
            message.success("Topic 已创建并领取");
            openPath(`/content/topics/${result.topicId}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Topic 创建失败");
        }
    };
    const footer = step === "workflow" ? null : (
        <>
            <Button disabled={pending} onClick={() => setStep(step === "topic-source" ? "workflow" : "topic-source")}>返回</Button>
            {step === "topic-pool" ? <Button type="primary" disabled={!selectedTopicId} loading={claim.isPending} onClick={() => void claimTopic()}>领取并打开</Button> : null}
            {step === "topic-create" ? <Button type="primary" loading={createTopic.isPending} onClick={() => void createAndOpenTopic()}>创建并打开</Button> : null}
        </>
    );

    return (
        <Modal open={open} title={step === "workflow" ? "添加项目" : step === "topic-source" ? "基于 Topic 生成内容" : step === "topic-pool" ? "选择公共 Topic" : "创建新 Topic"} onCancel={close} footer={footer} closable={!pending} maskClosable={!pending} destroyOnHidden>
            {step === "workflow" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    <WorkflowCard icon={<GraduationCap className="size-5" />} title="课程视频" description="按角色、文案与场景、音频、视频完成课程制作。" onClick={() => createVideo("course-flow")} />
                    <WorkflowCard icon={<Mic2 className="size-5" />} title="口播视频" description="创建一个空白口播视频工作页。" onClick={() => createVideo("koubo-video")} />
                    <WorkflowCard icon={<FileText className="size-5" />} title="基于 Topic 生成内容" description="领取公共 Topic 或创建新 Topic。" onClick={() => setStep("topic-source")} />
                </div>
            ) : null}
            {step === "topic-source" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    <WorkflowCard icon={<Search className="size-5" />} title="选择公共 Topic" description="从公共 Topic 池领取并打开。" onClick={() => setStep("topic-pool")} />
                    <WorkflowCard icon={<FileText className="size-5" />} title="创建新 Topic" description="填写 Topic 后直接创建并领取。" onClick={() => setStep("topic-create")} />
                </div>
            ) : null}
            {step === "topic-pool" ? (
                <div className="space-y-4">
                    <Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<Search className="size-4 text-muted-foreground" />} placeholder="搜索公共 Topic" />
                    {topics.isLoading ? <Skeleton active /> : topics.isError ? <Empty description="公共 Topic 读取失败"><Button onClick={() => void topics.refetch()}>重新加载</Button></Empty> : !topics.data?.length ? <Empty description="公共池暂时没有匹配的 Topic" /> : (
                        <div className="max-h-80 space-y-2 overflow-y-auto thin-scrollbar">
                            {topics.data.map((topic) => (
                                <button key={topic.id} type="button" aria-pressed={selectedTopicId === topic.id} onClick={() => setSelectedTopicId(topic.id)} className={`w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedTopicId === topic.id ? "border-foreground" : "border-border"}`}>
                                    <span className="font-medium">{topic.title}</span>
                                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{topic.originalTopic}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}
            {step === "topic-create" ? <TopicCreateForm form={form} claimMode="required" /> : null}
        </Modal>
    );
}

function WorkflowCard({ icon, title, description, loading, onClick }: { icon: React.ReactNode; title: string; description: string; loading?: boolean; onClick: () => void }) {
    return (
        <button type="button" disabled={loading} onClick={onClick} className="flex min-h-36 w-full flex-col items-start rounded-2xl border border-border bg-[var(--surface-raised)] p-4 text-left transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-[var(--disabled-opacity)]">
            <span className="text-foreground">{icon}</span>
            <span className="mt-4 block font-semibold">{loading ? "正在创建..." : title}</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
        </button>
    );
}
