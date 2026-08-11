import { Select } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type MediaOption = { nodeId: string; label: string; title: string };

type CanvasVideoReferenceFieldsProps = {
    videos: MediaOption[];
    selectedVideoNodeId?: string;
    onVideoChange: (nodeId?: string) => void;
};

export function CanvasVideoReferenceFields({ videos, selectedVideoNodeId, onVideoChange }: CanvasVideoReferenceFieldsProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const options = (items: MediaOption[]) => items.map((item) => ({ value: item.nodeId, label: `@${item.label} · ${item.title}` }));
    return (
        <div className="mb-2 grid gap-2">
            <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium" style={{ color: theme.node.muted }}>待编辑视频（必选）</span>
                <Select className="w-full" value={selectedVideoNodeId} options={options(videos)} placeholder="@ 主动选择一条视频" allowClear showSearch optionFilterProp="label" onChange={onVideoChange} />
            </label>
        </div>
    );
}
