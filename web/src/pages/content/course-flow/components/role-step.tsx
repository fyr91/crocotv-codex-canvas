import { Button, Empty, Input } from "antd";
import { Pause, Play, Plus, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { CourseFlowRole } from "@/types/course-flow";

export function RoleStep({ roles, selectedRoleId, onSelect, onCreate, onNext }: {
    roles: CourseFlowRole[];
    selectedRoleId: string | null;
    onSelect: (role: CourseFlowRole) => void;
    onCreate: () => void;
    onNext: () => void;
}) {
    const [search, setSearch] = useState("");
    const selected = roles.find((role) => role.id === selectedRoleId) || null;
    const filtered = useMemo(() => roles.filter((role) => `${role.name} ${role.description}`.toLowerCase().includes(search.trim().toLowerCase())), [roles, search]);
    return (
        <section className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-8">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div><h1 className="text-2xl font-semibold tracking-tight">选择课程角色</h1><p className="mt-1 text-sm text-muted-foreground">先确定角色形象与声音，后续可批量用于不同 Topic。</p></div>
                <div className="flex gap-2"><Button icon={<Plus className="size-4" />} onClick={onCreate}>创建角色</Button><Button type="primary" disabled={!selected} onClick={onNext}>下一步：文案与场景</Button></div>
            </header>
            <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(480px,1.1fr)]">
                <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)]">
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} prefix={<Search className="size-4 text-muted-foreground" />} placeholder="搜索角色" allowClear />
                    <p className="mb-4 mt-4 text-sm font-medium">所有角色 · {filtered.length}</p>
                    {filtered.length ? <div className="grid max-h-[calc(100vh-310px)] grid-cols-2 gap-3 overflow-y-auto pr-1 thin-scrollbar">{filtered.map((role) => (
                        <button key={role.id} type="button" aria-pressed={selected?.id === role.id} onClick={() => onSelect(role)} className={`overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === role.id ? "border-foreground shadow-[var(--elevation-card-hover)]" : "border-border hover:border-[var(--border-strong)]"}`}>
                            <img src={role.frontUrl} alt={role.name} className="block aspect-[4/3] w-full rounded-t-[11px] object-cover" />
                            <div className="p-3"><strong className="block truncate text-sm">{role.name}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">声音：{role.voiceName}</span></div>
                        </button>
                    ))}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的角色" />}
                </div>
                <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-raised)] p-5 shadow-[var(--elevation-card)] thin-scrollbar">
                    {selected ? <RoleDetail role={selected} /> : <Empty className="py-24" image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个角色查看详情" />}
                </div>
            </div>
        </section>
    );
}

function RoleDetail({ role }: { role: CourseFlowRole }) {
    const audio = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const toggle = () => { if (!audio.current) return; if (audio.current.paused) void audio.current.play(); else audio.current.pause(); };
    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="flex h-8 items-center text-xl font-semibold leading-none">{role.name}</h2>
                <button type="button" disabled={!role.previewUrl} aria-label={playing ? `暂停${role.name}试听` : `播放${role.name}试听`} title={playing ? "暂停试听" : "播放试听"} onClick={toggle} className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}<span className="text-xs">试听角色声音</span></button>
                <audio ref={audio} src={role.previewUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{role.description || "暂无角色描述"}</p>
            <p className="mb-2 mt-5 text-sm font-medium">角色图片</p>
            <img src={role.designSheetUrl} alt={`${role.name}三视图`} className="max-h-[460px] w-full rounded-xl border border-border bg-[var(--surface-sunken)] object-contain" />
        </div>
    );
}
