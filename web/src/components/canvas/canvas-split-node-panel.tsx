import { useEffect } from "react";
import type { CSSProperties } from "react";
import { Button, InputNumber, Segmented } from "antd";
import { LoaderCircle, Play, Settings2, Split, Square } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { requiredInputModalities } from "@/lib/canvas/canvas-split";
import { canvasThemes } from "@/lib/canvas-theme";
import { selectableModelsByInputModalities, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { reasoningDisplayState } from "@/lib/canvas/canvas-node-reasoning";
import { CanvasNodeReasoningBox } from "./canvas-node-reasoning-box";

type CanvasSplitNodePanelProps = {
    node: CanvasNodeData;
    inputs: NodeGenerationInput[];
    isRunning: boolean;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasSplitNodePanel({ node, inputs, isRunning, onConfigChange, onGenerate, onStop, onComposerToggle }: CanvasSplitNodePanelProps) {
    const config = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const required = requiredInputModalities(inputs);
    const models = selectableModelsByInputModalities(config, required);
    const model = models.includes(node.metadata?.model || "") ? node.metadata?.model || "" : models.includes(config.textModel) ? config.textModel : models[0] || "";
    const splitCount = node.metadata?.splitCount ?? "auto";
    const isFixed = splitCount !== "auto";
    const summary = {
        text: inputs.filter((input) => input.type === "text").length,
        image: inputs.filter((input) => input.type === "image").length,
        video: inputs.filter((input) => input.type === "video").length,
        audio: inputs.filter((input) => input.type === "audio").length,
    };
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const reasoning = reasoningDisplayState(node.metadata || {});

    useEffect(() => {
        if (model !== (node.metadata?.model || "")) onConfigChange(node.id, { model });
    }, [model, node.id, node.metadata?.model, onConfigChange]);

    return (
        <div className="absolute inset-0 flex cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Split className="size-4" />拆分</div>
            {!reasoning.running ? <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                    <InputChip label="文字" value={summary.text} style={chipStyle} />
                    <InputChip label="图片" value={summary.image} style={chipStyle} />
                    <InputChip label="视频" value={summary.video} style={chipStyle} />
                    <InputChip label="音频" value={summary.audio} style={chipStyle} />
                    <button type="button" className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px]" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}><Settings2 className="size-3.5" />组装内容</button>
                </div>
                <div className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_168px] items-center gap-2 cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <ModelPicker className="canvas-compact-control h-10" config={config} value={model} models={models} onChange={(value) => onConfigChange(node.id, { model: value })} capability="text" placeholder={models.length ? "选择模型" : "没有兼容模型"} onMissingConfig={() => openConfigDialog(true)} fullWidth />
                    <div className="flex h-10 items-center gap-1 rounded-lg border px-1.5" style={chipStyle}>
                        <Segmented size="small" value={isFixed ? "fixed" : "auto"} options={[{ label: "Auto", value: "auto" }, { label: "指定", value: "fixed" }]} onChange={(value) => onConfigChange(node.id, { splitCount: value === "auto" ? "auto" : typeof splitCount === "number" ? splitCount : 4 })} />
                        {isFixed ? <InputNumber size="small" className="!w-14" min={2} max={24} precision={0} controls={false} value={splitCount} onChange={(value) => onConfigChange(node.id, { splitCount: Math.min(24, Math.max(2, Number(value) || 2)) })} /> : null}
                    </div>
                </div>
                {!models.length && inputs.length ? <div className="mb-2 text-xs" style={{ color: theme.node.muted }}>没有支持当前输入类型的模型</div> : null}
            </> : null}
            {reasoning.visible ? <div className="mb-2"><CanvasNodeReasoningBox text={node.metadata?.reasoningText} running={reasoning.running} /></div> : null}
            <Button type="primary" className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg" danger={isRunning} disabled={!isRunning && (!inputs.length || !model)} onMouseDown={(event) => event.stopPropagation()} onClick={() => isRunning ? onStop(node.id) : onGenerate(node.id)}>
                <span className="inline-flex items-center gap-1.5">
                    {isRunning ? <><LoaderCircle className="size-4 animate-spin" /><Square className="size-3.5 fill-current" /><span>停止</span></> : <><Play className="size-4" /><span>开始拆分</span></>}
                </span>
            </Button>
        </div>
    );
}

function InputChip({ label, value, style }: { label: string; value: number; style: CSSProperties }) {
    return <div className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}><span>{label}</span><span className="font-medium">{value}</span></div>;
}
