import { VideoFramePicker } from "@/components/media/video-frame-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasVideoFramePickerProps = {
    sourceUrl: string;
    initialTime?: number;
    readOnly?: boolean;
    onTimeCommit: (time: number) => void;
    onCancel: () => void;
    onConfirm: (result: { blob: Blob; time: number; width: number; height: number }) => Promise<void> | void;
};

export function CanvasVideoFramePicker(props: CanvasVideoFramePickerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <VideoFramePicker
            {...props}
            appearance={{
                fill: theme.node.fill,
                text: theme.node.text,
                muted: theme.node.muted,
                canvasBackground: theme.canvas.background,
                stroke: theme.node.stroke,
                activeStroke: theme.node.activeStroke,
            }}
        />
    );
}
