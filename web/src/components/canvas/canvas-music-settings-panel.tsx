import { Collapse, Input, InputNumber, Select, Slider, Switch } from "antd";
import type { ReactNode } from "react";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { MUSIC_STYLE_GROUPS, musicLimits, type MusicGenerationConfig } from "@/lib/music-generation";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasNodeMetadata } from "@/types/canvas";

export function CanvasMusicSettingsPanel({ music, model, references, compact = false, onChange }: { music: MusicGenerationConfig; model: string; references: CanvasResourceReference[]; compact?: boolean; onChange: (patch: Partial<CanvasNodeMetadata>) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const limits = musicLimits(model);
    const textareaClass = `w-full rounded-xl border px-3 py-2 text-sm leading-7 ${compact ? "h-20" : "h-28"}`;
    const textareaStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };

    return (
        <div className="space-y-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <Field label="音乐标题" count={`${music.title.length}/${limits.title}`}>
                <Input size="small" value={music.title} maxLength={limits.title} placeholder="输入音乐标题" onChange={(event) => onChange({ musicTitle: event.target.value })} />
            </Field>
            <Field label="音乐描述" count={`${music.description.length}/${limits.description}`}>
                <CanvasResourceMentionTextarea value={music.description} maxLength={limits.description} references={references} onChange={(musicDescription) => onChange({ musicDescription })} copyCurrentInput className={textareaClass} style={textareaStyle} placeholder="描述曲风、情绪、节奏和乐器，输入 @ 引用文本" />
            </Field>
            <div className="flex items-center justify-between rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                <div>
                    <div className="text-xs font-medium">纯音乐</div>
                    <div className="text-[10px] opacity-50">开启后不需要歌词</div>
                </div>
                <Switch size="small" checked={music.instrumental} onChange={(musicInstrumental) => onChange({ musicInstrumental })} />
            </div>
            {music.instrumental ? null : (
                <Field label="歌词" count={`${music.lyrics.length}/${limits.lyrics}`}>
                    <CanvasResourceMentionTextarea value={music.lyrics} maxLength={limits.lyrics} references={references} onChange={(musicLyrics) => onChange({ musicLyrics })} copyCurrentInput className={`${textareaClass} ${compact ? "!h-24" : "!h-32"}`} style={textareaStyle} placeholder="输入歌词，输入 @ 引用已连接文本" />
                </Field>
            )}
            <div className="space-y-1.5">
                {MUSIC_STYLE_GROUPS.map((group) => (
                    <div key={group.label} className="flex items-start gap-2">
                        <span className="w-7 shrink-0 pt-1 text-[10px] opacity-45">{group.label}</span>
                        <div className="flex flex-wrap gap-1">
                            {group.options.map((option) => {
                                const active = music.styles.includes(option.value);
                                return <button key={option.value} type="button" className="rounded-md border px-1.5 py-0.5 text-[10px] transition" style={{ background: active ? theme.toolbar.activeBg : theme.node.fill, borderColor: active ? theme.toolbar.activeText : theme.node.stroke, color: active ? theme.toolbar.activeText : theme.node.muted }} onClick={() => onChange({ musicStyles: active ? music.styles.filter((item) => item !== option.value) : [...music.styles, option.value] })}>{option.label}</button>;
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <Collapse
                ghost
                size="small"
                className="canvas-music-advanced !rounded-lg !border"
                style={{ borderColor: theme.node.stroke }}
                items={[{
                    key: "advanced",
                    label: <span className="text-xs">高级设置</span>,
                    children: (
                        <div className="space-y-3">
                            <Field label="排除风格"><Input size="small" value={music.negativeTags} placeholder="例如 Heavy Metal, Upbeat Drums" onChange={(event) => onChange({ musicNegativeTags: event.target.value })} /></Field>
                            {music.instrumental ? null : <Field label="演唱性别"><Select<"m" | "f"> size="small" className="w-full" allowClear value={music.vocalGender} placeholder="不指定" options={[{ label: "男声", value: "m" }, { label: "女声", value: "f" }]} onChange={(musicVocalGender) => onChange({ musicVocalGender })} /></Field>}
                            <WeightField label="风格遵循度" value={music.styleWeight} onChange={(musicStyleWeight) => onChange({ musicStyleWeight })} />
                            <WeightField label="创意度" value={music.weirdnessConstraint} onChange={(musicWeirdnessConstraint) => onChange({ musicWeirdnessConstraint })} />
                            {model === "minimax-music-3" ? <Field label="生成时长（秒）"><InputNumber size="small" className="w-full" min={1} max={360} step={1} value={music.maxDuration ?? 120} onChange={(value) => onChange({ musicMaxDuration: Number(value) || 120 })} /></Field> : null}
                        </div>
                    ),
                }]}
            />
        </div>
    );
}

function Field({ label, count, children }: { label: string; count?: string; children: ReactNode }) {
    return <div className="block"><span className="mb-1 flex items-center justify-between text-[11px] font-medium"><span>{label}</span>{count ? <span className="font-normal opacity-40">{count}</span> : null}</span>{children}</div>;
}

function WeightField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return <div><div className="mb-1 flex items-center justify-between text-[11px]"><span>{label}</span><span className="opacity-50">{value.toFixed(2)}</span></div><Slider min={0} max={1} step={0.01} value={value} onChange={onChange} /></div>;
}
