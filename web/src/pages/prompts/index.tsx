import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Input, Modal, Spin } from "antd";
import { Pencil, Search, Trash2 } from "lucide-react";

import { LibraryPage } from "@/components/layout/page-shell";
import { deleteSharedPrompt, listMySharedPrompts, updateSharedPrompt, type SharedPrompt } from "@/services/api/shared-prompts";
import { useUserStore } from "@/stores/use-user-store";

const sourceLabels: Record<SharedPrompt["sourceNodeType"], string> = { text: "文本", config: "生成配置", image: "图片", video: "视频", audio: "音频", music: "音乐" };

export default function PromptsPage() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const profile = useUserStore((state) => state.profile);
    const [keyword, setKeyword] = useState("");
    const [editing, setEditing] = useState<SharedPrompt | null>(null);
    const [title, setTitle] = useState("");
    const [prompt, setPrompt] = useState("");
    const queryKey = ["my-shared-prompts", profile?.id];
    const query = useQuery({ queryKey, queryFn: () => listMySharedPrompts(profile!.id), enabled: Boolean(profile?.id) });
    const items = useMemo(() => {
        const normalized = keyword.trim().toLowerCase();
        return (query.data || []).filter((item) => !normalized || `${item.title}\n${item.prompt}`.toLowerCase().includes(normalized));
    }, [keyword, query.data]);
    const refresh = async () => {
        await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ["prompts"] })]);
    };
    const updateMutation = useMutation({
        mutationFn: () => updateSharedPrompt(editing!.id, { title: title.trim(), prompt: prompt.trim(), creatorName: profile!.display_name || profile!.username }),
        onSuccess: async () => {
            await refresh();
            setEditing(null);
            message.success("提示词已更新");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "更新提示词失败"),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteSharedPrompt,
        onSuccess: async () => {
            await refresh();
            message.success("提示词已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除提示词失败"),
    });
    const openEdit = (item: SharedPrompt) => {
        setEditing(item);
        setTitle(item.title);
        setPrompt(item.prompt);
    };
    const confirmDelete = (item: SharedPrompt) => {
        modal.confirm({ title: "删除这条提示词？", content: item.title, okText: "删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => deleteMutation.mutateAsync(item.id) });
    };

    return (
        <LibraryPage
            title="我的提示词"
            description="管理你从画布收藏的提示词。收藏内容会自动分享给所有 CrocoTV 用户。"
            width="5xl"
            header={
                <div className="mx-auto w-full max-w-2xl">
                    <Input.Search className="w-full" size="large" prefix={<Search className="size-4 text-stone-400" />} placeholder="搜索标题或提示词" allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={setKeyword} />
                </div>
            }
        >
            <div>
                {query.isLoading ? (
                    <div className="flex h-60 items-center justify-center">
                        <Spin />
                    </div>
                ) : null}
                {query.isError ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="提示词加载失败" className="py-20" /> : null}
                {!query.isLoading && !query.isError && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? "没有匹配的提示词" : "还没有收藏提示词"} className="py-20" /> : null}
                {items.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {items.map((item) => (
                            <article key={item.id} className="flex h-72 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-950">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                                        <p className="mt-1 text-xs text-stone-400">来源：{sourceLabels[item.sourceNodeType]}</p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        <Button type="text" size="small" icon={<Pencil className="size-3.5" />} aria-label="编辑提示词" title="编辑" onClick={() => openEdit(item)} />
                                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} aria-label="删除提示词" title="删除" onClick={() => confirmDelete(item)} />
                                    </div>
                                </div>
                                <p
                                    role="region"
                                    tabIndex={0}
                                    aria-label={`提示词内容：${item.title}`}
                                    className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-stone-300"
                                >
                                    {item.prompt}
                                </p>
                            </article>
                        ))}
                    </div>
                ) : null}
            </div>

            <Modal
                title="编辑提示词"
                open={Boolean(editing)}
                okText="保存"
                cancelText="取消"
                confirmLoading={updateMutation.isPending}
                okButtonProps={{ disabled: !title.trim() || !prompt.trim() }}
                onCancel={() => setEditing(null)}
                onOk={() => updateMutation.mutate()}
            >
                <div className="space-y-4 pt-2">
                    <label className="block text-sm">
                        <span className="mb-2 block text-stone-500 dark:text-stone-400">标题</span>
                        <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-2 block text-stone-500 dark:text-stone-400">提示词</span>
                        <Input.TextArea value={prompt} rows={10} onChange={(event) => setPrompt(event.target.value)} />
                    </label>
                </div>
            </Modal>
        </LibraryPage>
    );
}
