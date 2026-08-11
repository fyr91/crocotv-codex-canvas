import { App, Button, Empty, Input, Select, Skeleton, Tag } from "antd";
import dayjs from "dayjs";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ContentSourceType } from "@/types/content-production";
import { useClaimContentTopicMutation, useContentMembersQuery, useContentTopicsQuery } from "../use-content-production";
import { TopicCreateModal } from "./topic-create-modal";

const sourceLabels: Record<ContentSourceType, string> = {
    ai_planning: "AI Planning",
    member: "团队创建",
    inspiration: "灵感衍生",
    api: "系统 / API",
};

export function TopicPool() {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const [search, setSearch] = useState("");
    const [sourceType, setSourceType] = useState<ContentSourceType | undefined>();
    const [tags, setTags] = useState<string[]>([]);
    const [createdBy, setCreatedBy] = useState<string>();
    const [sort, setSort] = useState<"newest" | "oldest">("newest");
    const [createOpen, setCreateOpen] = useState(false);
    const members = useContentMembersQuery(true);
    const topics = useContentTopicsQuery({ status: "pool", sourceType, search, tags, createdBy, sort });
    const claim = useClaimContentTopicMutation();

    const claimTopic = async (topicId: string) => {
        try {
            await claim.mutateAsync(topicId);
            message.success("Topic 已领取");
            navigate(`/content/topics/${topicId}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "领取失败");
        }
    };

    return (
        <section>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <Input
                    allowClear
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    prefix={<Search className="size-4 text-muted-foreground" />}
                    placeholder="搜索 Topic"
                    className="max-w-sm"
                />
                <Select
                    allowClear
                    value={sourceType}
                    onChange={setSourceType}
                    placeholder="全部来源"
                    className="w-40"
                    options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))}
                />
                <Select
                    mode="tags"
                    value={tags}
                    onChange={setTags}
                    placeholder="Tag 筛选"
                    className="min-w-40"
                    tokenSeparators={[",", "，"]}
                />
                <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={createdBy}
                    onChange={setCreatedBy}
                    placeholder="创建人"
                    className="w-36"
                    options={(members.data || []).map((member) => ({ value: member.id, label: member.displayName }))}
                />
                <Select
                    value={sort}
                    onChange={setSort}
                    className="w-32"
                    options={[{ value: "newest", label: "最新创建" }, { value: "oldest", label: "最早创建" }]}
                />
                <Button
                    type="primary"
                    icon={<Plus className="size-4" />}
                    onClick={() => setCreateOpen(true)}
                    className="ml-auto"
                >
                    创建 Topic
                </Button>
            </div>

            {topics.isLoading ? <Skeleton active /> : null}
            {!topics.isLoading && !topics.data?.length ? <Empty description="公共池暂时没有匹配的 Topic" /> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {topics.data?.map((topic) => (
                    <article key={topic.id} className="flex min-h-48 flex-col rounded-2xl border border-border bg-[var(--surface-raised)] p-5 transition-colors hover:border-foreground/20">
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>{sourceLabels[topic.sourceType]}</span>
                            <span>{dayjs(topic.createdAt).format("MM-DD HH:mm")}</span>
                        </div>
                        <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">{topic.title}</h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{topic.originalTopic}</p>
                        <div className="mt-3 flex flex-wrap gap-1">{topic.tags.slice(0, 5).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
                        <div className="mt-auto pt-4">
                            <Button block loading={claim.isPending} onClick={() => claimTopic(topic.id)}>领取 Topic</Button>
                        </div>
                    </article>
                ))}
            </div>

            <TopicCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onClaimed={(topicId) => navigate(`/content/topics/${topicId}`)} />
        </section>
    );
}
