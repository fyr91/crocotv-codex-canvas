import { Select } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import type { VideoInputMode } from "@/lib/video-input-mode";
import { useThemeStore } from "@/stores/use-theme-store";
import { videoFrameFieldVisibility } from "./canvas-video-frame-visibility";

export type VideoFrameReference = { nodeId: string; label: string; title: string };

type CanvasVideoFrameFieldsProps = {
    mode: VideoInputMode;
    allowMultimodalFrames?: boolean;
    images: VideoFrameReference[];
    firstFrameNodeId?: string;
    lastFrameNodeId?: string;
    onFirstFrameChange: (nodeId?: string) => void;
    onLastFrameChange: (nodeId?: string) => void;
};

export function CanvasVideoFrameFields({ mode, allowMultimodalFrames = false, images, firstFrameNodeId, lastFrameNodeId, onFirstFrameChange, onLastFrameChange }: CanvasVideoFrameFieldsProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { showFields, showLastFrame } = videoFrameFieldVisibility(mode, allowMultimodalFrames);
    if (!showFields) return null;
    const options = images.map((reference) => ({ value: reference.nodeId, label: `@${reference.label} · ${reference.title}` }));
    return (
        <div className={`mb-2 grid gap-2 ${showLastFrame ? "grid-cols-2" : "grid-cols-1"}`}>
            <FrameField label="首帧图片" value={firstFrameNodeId} options={options} placeholder="@ 选择首帧图片" color={theme.node.muted} onChange={onFirstFrameChange} />
            {showLastFrame ? <FrameField label="尾帧图片" value={lastFrameNodeId} options={options} placeholder="未选择则使用首帧" color={theme.node.muted} onChange={onLastFrameChange} /> : null}
        </div>
    );
}

function FrameField({ label, value, options, placeholder, color, onChange }: { label: string; value?: string; options: Array<{ value: string; label: string }>; placeholder: string; color: string; onChange: (value?: string) => void }) {
    return (
        <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium" style={{ color }}>{label}</span>
            <Select className="w-full" value={value} options={options} placeholder={placeholder} allowClear showSearch optionFilterProp="label" onChange={onChange} />
        </label>
    );
}
