import { type ReactNode } from "react";
import { ConfigProvider, Switch } from "antd";

import { IMAGE_GENERATION_MAX_COUNT } from "@/constant/image";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { imageSizeValue, resolveImageSizeSelection } from "@/lib/image-generation-size";
import { imageSizePresetsForModel, modelSupportsImagePromptOptimize, modelSupportsImageSearch, modelSupportsImageWebSearch, type AiConfig } from "@/stores/use-config-store";

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "size" | "count" | "imagePromptOptimize" | "imageWebSearch" | "imageSearch", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: ImageSettingsPanelProps) {
    const count = Math.max(1, Math.min(IMAGE_GENERATION_MAX_COUNT, Math.floor(Math.abs(Number(config.count)) || 1)));
    const presets = imageSizePresetsForModel(config.model);
    const selection = resolveImageSizeSelection(presets, config.size);
    const resolutions = Object.keys(presets);
    const ratios = Object.keys(presets[selection.resolution] || {});

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement) return;
                    if (document.activeElement instanceof HTMLInputElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-lg font-semibold">图像设置</div> : null}
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>分辨率</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {resolutions.map((resolution) => (
                            <OptionPill
                                key={resolution}
                                selected={selection.resolution === resolution}
                                theme={theme}
                                onClick={() => onConfigChange("size", imageSizeValue(presets, resolution, presets[resolution]?.[selection.ratio] ? selection.ratio : "auto"))}
                            >
                                {resolution}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>比例</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {ratios.map((ratio) => (
                            <button
                                key={ratio}
                                type="button"
                                className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent text-xs transition hover:opacity-80"
                                style={{ borderColor: selection.ratio === ratio ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", imageSizeValue(presets, selection.resolution, ratio))}
                            >
                                <RatioIcon ratio={ratio} color={theme.node.text} />
                                <span>{ratio === "auto" ? "Auto" : ratio}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>生成张数</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {Array.from({ length: IMAGE_GENERATION_MAX_COUNT }, (_, index) => index + 1).map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                {value} 张
                            </OptionPill>
                        ))}
                    </div>
                </div>
                {modelSupportsImagePromptOptimize(config.model) ? (
                    <div className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2.5" style={{ borderColor: theme.node.stroke }}>
                        <div>
                            <div className="text-sm font-medium">提示词优化</div>
                            <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>由模型补充画面细节</div>
                        </div>
                        <span onMouseDown={(event) => event.stopPropagation()}>
                            <Switch checked={config.imagePromptOptimize === "true"} onChange={(value) => onConfigChange("imagePromptOptimize", String(value))} />
                        </span>
                    </div>
                ) : null}
                {modelSupportsImageWebSearch(config.model) ? <SettingSwitch label="联网搜索" checked={config.imageWebSearch === "true"} theme={theme} onChange={(value) => onConfigChange("imageWebSearch", String(value))} /> : null}
                {modelSupportsImageSearch(config.model) ? <SettingSwitch label="图片搜索" checked={config.imageSearch === "true"} theme={theme} onChange={(value) => onConfigChange("imageSearch", String(value))} /> : null}
            </div>
        </ImageSettingsTheme>
    );
}

function SettingSwitch({ label, checked, theme, onChange }: { label: string; checked: boolean; theme: CanvasTheme; onChange: (value: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-3 py-2.5" style={{ borderColor: theme.node.stroke }}>
            <span className="text-sm font-medium">{label}</span>
            <span onMouseDown={(event) => event.stopPropagation()}><Switch checked={checked} onChange={onChange} /></span>
        </label>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function RatioIcon({ ratio, color }: { ratio: string; color: string }) {
    if (ratio === "auto") return <span className="grid h-7 w-9 place-items-center text-[10px] font-medium">AUTO</span>;
    const [width, height] = ratio.split(":").map(Number);
    const value = width / Math.max(1, height);
    const boxWidth = value >= 1 ? 24 : Math.max(10, 24 * value);
    const boxHeight = value >= 1 ? Math.max(10, 24 / value) : 24;
    return (
        <span className="grid h-7 w-9 place-items-center">
            <span className="border-2" style={{ width: boxWidth, height: boxHeight, borderColor: color }} />
        </span>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}
