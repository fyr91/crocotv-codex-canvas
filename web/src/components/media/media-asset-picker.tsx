import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Empty, Input, Pagination, Tag } from "antd";
import { FileText, Music2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaAssetPickerItem = {
    id: string;
    title: string;
    kind: "text" | "image" | "video" | "audio";
    previewUrl?: string;
    searchText?: string;
};

const PAGE_SIZE = 8;
const DEFAULT_KINDS: MediaAssetPickerItem["kind"][] = ["text", "image", "video", "audio"];
const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
] as const;

export function MediaAssetPicker({
    items,
    onPick,
    allowedKinds = DEFAULT_KINDS,
    actionLabel = "选择",
    draggable = false,
    hoverVideoPreview = false,
    onDragStart,
    onDragEnd,
}: {
    items: MediaAssetPickerItem[];
    onPick: (item: MediaAssetPickerItem) => void;
    allowedKinds?: MediaAssetPickerItem["kind"][];
    actionLabel?: string;
    draggable?: boolean;
    hoverVideoPreview?: boolean;
    onDragStart?: (item: MediaAssetPickerItem, event: DragEvent<HTMLButtonElement>) => void;
    onDragEnd?: (item: MediaAssetPickerItem, event: DragEvent<HTMLButtonElement>) => void;
}) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<MediaAssetPickerItem["kind"] | "all">("all");
    const [page, setPage] = useState(1);
    const options = kindOptions.filter((option) => option.value === "all" || allowedKinds.includes(option.value));
    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items
            .filter((item) => allowedKinds.includes(item.kind))
            .filter((item) => kindFilter === "all" || item.kind === kindFilter)
            .filter((item) => !query || `${item.title} ${item.searchText || ""}`.toLowerCase().includes(query));
    }, [allowedKinds, items, keyword, kindFilter]);
    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

    useEffect(() => {
        setPage((value) => Math.min(value, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))));
    }, [filtered.length]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56 max-w-full"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索素材"
                    value={keyword}
                    allowClear
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                />
                <div className="flex gap-1.5">
                    {options.map((option) => (
                        <Tag.CheckableTag
                            key={option.value}
                            checked={kindFilter === option.value}
                            className={cn("filter-chip", kindFilter === option.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option.value);
                            }}
                        >
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>
            {visible.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {visible.map((item) => (
                        <MediaAssetCard
                            key={item.id}
                            item={item}
                            actionLabel={actionLabel}
                            draggable={draggable}
                            hoverVideoPreview={hoverVideoPreview}
                            onClick={() => onPick(item)}
                            onDragStart={(event) => onDragStart?.(item, event)}
                            onDragEnd={(event) => onDragEnd?.(item, event)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有素材" className="py-12" />
            )}
            {filtered.length > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}

function MediaAssetCard({
    item,
    actionLabel,
    draggable,
    hoverVideoPreview,
    onClick,
    onDragStart,
    onDragEnd,
}: {
    item: MediaAssetPickerItem;
    actionLabel: string;
    draggable: boolean;
    hoverVideoPreview: boolean;
    onClick: () => void;
    onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
    onDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
}) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [item.previewUrl]);
    return (
        <button
            type="button"
            draggable={draggable}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        >
            {item.kind === "audio" || item.kind === "text" ? (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted p-3 text-center text-xs leading-5 text-muted-foreground">
                    {item.kind === "audio" ? <Music2 className="size-8 opacity-60" /> : <FileText className="size-8 opacity-60" />}
                    <span className="line-clamp-2">{item.title}</span>
                </div>
            ) : !item.previewUrl || failed ? (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {item.kind === "audio" ? <Music2 className="size-8 opacity-60" /> : null}
                    <span className="line-clamp-2">{item.title}</span>
                </div>
            ) : item.kind === "video" ? (
                <video
                    data-media-playback-exempt
                    src={item.previewUrl}
                    className="aspect-[4/3] w-full bg-black object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    onMouseEnter={(event) => hoverVideoPreview && void event.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(event) => {
                        if (!hoverVideoPreview) return;
                        event.currentTarget.pause();
                        event.currentTarget.currentTime = 0;
                    }}
                    onError={() => setFailed(true)}
                />
            ) : (
                <img src={item.previewUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" onError={() => setFailed(true)} />
            )}
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-stone-800 dark:text-stone-200">{item.title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{item.kind === "text" ? "文本" : item.kind === "image" ? "图片" : item.kind === "video" ? "视频" : "音频"}</Tag>
                </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">{actionLabel}</div>
        </button>
    );
}
