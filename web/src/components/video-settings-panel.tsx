import { type ReactNode } from "react";
import { Segmented, Switch } from "antd";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { normalizeVideoGenerationOptions } from "@/lib/video-generation-options";
import { activeVideoModel } from "@/lib/video-model";
import { boolConfig } from "@/lib/seedance-video";
import { modelConfigForModel, providerIdForModel, type AiConfig } from "@/stores/use-config-store";

type VideoSettingKey = "vquality" | "size" | "videoSeconds" | "videoCount" | "videoGenerateAudio" | "videoWatermark" | "videoReturnLastFrame" | "videoPromptEnhance" | "videoStage1Review" | "videoAudioSetting" | "videoReferenceSizePolicy";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: VideoSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: VideoSettingsPanelProps) {
    const options = resolveVideoSettings(config);
    const providerId = providerIdForModel(activeVideoModel(config));
    const quality = options.qualities.find((item) => item.id === options.selection.quality) || options.qualities[0];
    const selectedAspect = options.aspectRatios?.find((item) => item.resolutions.some((resolution) => resolution.size === options.selection.size));
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    const returnLastFrame = boolConfig(config.videoReturnLastFrame, true);
    const promptEnhance = config.videoPromptEnhance !== "false";
    const hasOutputs = options.supports.generateAudio || options.supports.watermark || options.supports.returnLastFrame;
    const selectQuality = (qualityId: string) => {
        const next = resolveVideoSettings({ ...config, vquality: qualityId });
        onConfigChange("vquality", qualityId);
        if (next.selection.size && next.selection.size !== config.size) onConfigChange("size", next.selection.size);
    };
    const selectResolution = (size: string) => {
        const resolution = options.aspectRatios?.flatMap((item) => item.resolutions).find((item) => item.size === size);
        if (!resolution) return;
        const next = resolveVideoSettings({ ...config, vquality: resolution.qualityId || config.vquality, size });
        if (resolution.qualityId && resolution.qualityId !== config.vquality) onConfigChange("vquality", resolution.qualityId);
        onConfigChange("size", size);
        if (next.selection.duration && String(next.selection.duration) !== config.videoSeconds) onConfigChange("videoSeconds", String(next.selection.duration));
    };
    const selectAspect = (aspectId: string) => {
        const aspect = options.aspectRatios?.find((item) => item.id === aspectId);
        if (!aspect) return;
        const currentResolution = options.aspectRatios?.flatMap((item) => item.resolutions).find((item) => item.size === options.selection.size);
        const resolution = aspect.resolutions.find((item) => item.qualityId === options.selection.quality)
            || aspect.resolutions.find((item) => item.label === currentResolution?.label)
            || aspect.resolutions.find((item) => item.recommended)
            || aspect.resolutions[0];
        if (resolution) selectResolution(resolution.size);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {options.aspectRatios?.length ? (
                    <>
                        <SettingGroup title="比例" color={theme.node.muted}>
                            <div className="grid grid-cols-3 gap-2.5">
                                {options.aspectRatios.map((item) => {
                                    const preview = item.resolutions[0];
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className="flex h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                            style={{ borderColor: selectedAspect?.id === item.id ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onClick={() => selectAspect(item.id)}
                                        >
                                            <SizePreview width={preview?.width || 0} height={preview?.height || 0} color={theme.node.text} />
                                            <span>{item.label}</span>
                                            <span className="text-[10px] leading-none opacity-55">{item.ratio}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </SettingGroup>
                        {selectedAspect ? (
                            <SettingGroup title="分辨率" color={theme.node.muted}>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {selectedAspect.resolutions.map((item) => (
                                        <button
                                            key={item.size}
                                            type="button"
                                            className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1.5 py-2 text-sm transition hover:opacity-80"
                                            style={{ borderColor: options.selection.size === item.size ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onClick={() => selectResolution(item.size)}
                                        >
                                            <span>{item.label}</span>
                                            <span className="text-[10px] leading-none opacity-55">{resolutionLabel(item)}</span>
                                        </button>
                                    ))}
                                </div>
                            </SettingGroup>
                        ) : null}
                    </>
                ) : (
                    <>
                        <SettingGroup title="清晰度" color={theme.node.muted}>
                            <div className={"grid gap-2.5 " + (options.qualities.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                                {options.qualities.map((item) => (
                                    <OptionPill key={item.id} selected={options.selection.quality === item.id} disabled={item.disabled} theme={theme} onClick={() => selectQuality(item.id)}>
                                        {item.label}
                                    </OptionPill>
                                ))}
                            </div>
                        </SettingGroup>
                        {quality?.ratios.some((item) => item.size !== "source") ? <SettingGroup title="比例" color={theme.node.muted}>
                    {quality?.ratios.length ? (
                        <div className="grid grid-cols-3 gap-2.5">
                            {quality.ratios.map((item) => (
                                <button
                                    key={item.size}
                                    type="button"
                                    className="flex h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                    style={{ borderColor: options.selection.size === item.size ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => onConfigChange("size", item.size)}
                                >
                                    <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                    <span>{item.label}</span>
                                    <span className="text-[10px] leading-none opacity-55">{item.ratio || item.size}</span>
                                </button>
                            ))}
                        </div>
                    ) : <div className="text-xs opacity-55">当前清晰度暂无可用比例</div>}
                        </SettingGroup> : null}
                    </>
                )}
                {options.durations.length ? <SettingGroup title="时长" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {options.durations.map((value) => (
                            <OptionPill key={value} selected={options.selection.duration === value} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value === -1 ? "智能" : `${value}s`}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup> : null}
                <SettingGroup title="生成数量" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {options.counts.map((value) => (
                            <OptionPill key={value} selected={options.selection.count === value} theme={theme} onClick={() => onConfigChange("videoCount", String(value))}>
                                {value}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                {providerId === "minimax_h3" && config.videoInputMode === "multimodal" ? (
                    <SettingGroup title="高级设置 · 参考图尺寸策略" color={theme.node.muted}>
                        <Segmented
                            block
                            value={config.videoReferenceSizePolicy === "max" ? "max" : "match"}
                            options={[
                                { label: "match · 速度优先", value: "match" },
                                { label: "max · 细节优先", value: "max" },
                            ]}
                            onChange={(value) => onConfigChange("videoReferenceSizePolicy", String(value))}
                        />
                        <div className="text-[10px] leading-4 opacity-60">
                            {config.videoReferenceSizePolicy === "max"
                                ? "max 会保留更多参考图细节，但速度较慢、显存占用更高。"
                                : "match 按生成画布匹配参考图尺寸，推荐日常抽卡使用。"}
                        </div>
                    </SettingGroup>
                ) : null}
                {options.supports.promptEnhance ? (
                    <SettingGroup title="提示词" color={theme.node.muted}>
                        <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            <SwitchRow label="Prompt Enhance" checked={promptEnhance} theme={theme} onChange={(checked) => onConfigChange("videoPromptEnhance", String(checked))} />
                        </div>
                    </SettingGroup>
                ) : null}
                {options.supports.stage1Review ? (
                    <SettingGroup title="生成流程" color={theme.node.muted}>
                        <div className="grid gap-1 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            <SwitchRow label="Stage 1 后暂停审核" checked={config.videoStage1Review === "true"} theme={theme} onChange={(checked) => onConfigChange("videoStage1Review", String(checked))} />
                            <div className="pr-12 text-[10px] leading-4 opacity-55">先预览粗剪结果，确认后再继续 Stage 2 精修。</div>
                        </div>
                    </SettingGroup>
                ) : null}
                {options.supports.audioSetting ? (
                    <SettingGroup title="声音" color={theme.node.muted}>
                        <Segmented
                            block
                            value={config.videoAudioSetting || "auto"}
                            options={[{ label: "自动处理", value: "auto" }, { label: "保留原声", value: "origin" }]}
                            onChange={(value) => onConfigChange("videoAudioSetting", String(value))}
                        />
                    </SettingGroup>
                ) : null}
                {hasOutputs ? (
                    <SettingGroup title="输出" color={theme.node.muted}>
                        <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            {options.supports.generateAudio ? <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} /> : null}
                            {options.supports.watermark ? <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} /> : null}
                            {options.supports.returnLastFrame ? <SwitchRow label="保留尾帧" checked={returnLastFrame} theme={theme} onChange={(checked) => onConfigChange("videoReturnLastFrame", String(checked))} /> : null}
                        </div>
                    </SettingGroup>
                ) : null}
                {options.error ? <div className="text-xs leading-5 text-red-500">{options.error}</div> : null}
            </div>
        </ImageSettingsTheme>
    );
}

export function resolveVideoSettings(config: AiConfig) {
    const model = activeVideoModel(config);
    return normalizeVideoGenerationOptions(providerIdForModel(model) || "", modelConfigForModel(model), {
        inputMode: config.videoInputMode,
        quality: config.vquality,
        size: config.size,
        duration: config.videoSeconds,
        count: Number(config.videoCount),
    });
}

export function videoSettingsSummary(config: AiConfig) {
    const options = resolveVideoSettings(config);
    if (options.error) return "待同步配置";
    const quality = options.qualities.find((item) => item.id === options.selection.quality);
    const ratio = quality?.ratios.find((item) => item.size === options.selection.size);
    const aspect = options.aspectRatios?.find((item) => item.resolutions.some((resolution) => resolution.size === options.selection.size));
    const resolution = aspect?.resolutions.find((item) => item.size === options.selection.size);
    const duration = options.selection.duration === -1 ? "智能" : options.selection.duration ? `${options.selection.duration}s` : "";
    const review = options.supports.stage1Review && config.videoStage1Review === "true" ? "分步审核" : "";
    if (aspect && resolution) return [aspect.label, resolutionLabel(resolution), duration, `${options.selection.count} 个`, review].filter(Boolean).join(" · ");
    return [quality?.label || "默认", ratio?.size === "source" ? "" : ratio?.label || ratio?.ratio || "", duration, `${options.selection.count} 个`, review].filter(Boolean).join(" · ");
}

function resolutionLabel(resolution: { width: number; height: number; deliveryWidth?: number; deliveryHeight?: number }) {
    return `${resolution.deliveryWidth || resolution.width}×${resolution.deliveryHeight || resolution.height}`;
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>{title}</div>
            {children}
        </div>
    );
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    return <span className="rounded-[3px] border-2" style={{ width: Math.max(10, Math.round((width / longSide) * 26)), height: Math.max(10, Math.round((height / longSide) * 26)), borderColor: color }} />;
}

function SwitchRow({ label, checked, theme, onChange }: { label: string; checked: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>{label}</span>
            <span onMouseDown={(event) => event.stopPropagation()}><Switch size="small" checked={checked} onChange={onChange} /></span>
        </div>
    );
}
