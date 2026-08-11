import { useEffect, useId, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { videoInputModeOptions, type VideoInputMode } from "@/lib/video-input-mode";
import { activeVideoModel } from "@/lib/video-model";
import { normalizeVideoInputModeForModel, providerIdForModel, videoInputModesForModel, type AiConfig } from "@/stores/use-config-store";

type CanvasVideoInputModeControlProps = {
    config: AiConfig;
    className?: string;
    onChange: (value: VideoInputMode) => void;
};

export function CanvasVideoInputModeControl({ config, className, onChange }: CanvasVideoInputModeControlProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const model = activeVideoModel(config);
    const supported = videoInputModesForModel(model);
    const options = videoInputModeOptions.filter((option) => supported.includes(option.value));
    const current = normalizeVideoInputModeForModel(model, config.videoInputMode);
    const displayLabel = (value: VideoInputMode, fallback: string) => {
        const providerId = providerIdForModel(model);
        if (value === "multimodal" && providerId === "ltx") return "多模态";
        if (value === "multimodal" && providerId === "minimax_h3") return "多参考";
        return fallback;
    };
    const currentOption = options.find((option) => option.value === current);
    const currentLabel = currentOption
        ? displayLabel(currentOption.value, currentOption.label)
        : "";

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    if (!supported.length) return null;
    if (providerIdForModel(model) === "ltx") {
        return (
            <div
                aria-label="LTX 自动识别视频输入模式"
                role="status"
                className={cn(
                    "canvas-composer-model-picker flex h-8 w-fit max-w-full items-center justify-start rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm",
                    className || "h-10 w-[104px] shrink-0",
                )}
                title="根据首帧、尾帧、参考图片和音频自动选择工作流"
            >
                <span className="min-w-0 flex-1 truncate text-left">自动识别</span>
            </div>
        );
    }
    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(value) => onChange(value as VideoInputMode)}
        >
            <SelectTrigger
                aria-label="视频输入模式"
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full justify-start gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className || "h-10 w-[104px] shrink-0",
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={currentLabel}
            >
                <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-36 rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {displayLabel(option.value, option.label)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
