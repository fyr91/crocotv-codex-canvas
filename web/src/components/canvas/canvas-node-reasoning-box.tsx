import { useEffect, useRef, useState } from "react";
import { BrainCircuit, ChevronDown } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasNodeReasoningBox({
    text = "",
    running,
    runningLabel = "思考中",
    completeLabel = "思考过程",
}: {
    text?: string;
    running: boolean;
    runningLabel?: string;
    completeLabel?: string;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const followBottomRef = useRef(true);
    const open = running || expanded;

    useEffect(() => {
        const element = scrollRef.current;
        if (open && followBottomRef.current && element) element.scrollTop = element.scrollHeight;
    }, [open, text]);

    useEffect(() => {
        if (!running) return;
        followBottomRef.current = true;
        setExpanded(false);
    }, [running]);

    const content = text || "正在思考…";
    return (
        <div
            className="nodrag nowheel shrink-0 overflow-hidden rounded-lg border text-[11px]"
            style={{ background: `${theme.node.fill}cc`, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className={`flex h-7 w-full items-center gap-1.5 px-2 text-left ${running ? "cursor-default" : "cursor-pointer"}`}
                disabled={running}
                onClick={() => setExpanded((value) => !value)}
            >
                <BrainCircuit className={`size-3.5 shrink-0 ${running ? "animate-pulse" : ""}`} style={{ color: theme.node.muted }} />
                <span className="shrink-0 font-medium">{running ? runningLabel : completeLabel}</span>
                {!open ? <span className="min-w-0 flex-1 truncate opacity-55">{text}</span> : <span className="flex-1" />}
                {!running ? <ChevronDown className={`size-3.5 shrink-0 opacity-50 transition-transform ${expanded ? "rotate-180" : ""}`} /> : null}
            </button>
            {open ? (
                <div
                    ref={scrollRef}
                    className="thin-scrollbar mx-2 mb-2 overflow-y-auto whitespace-pre-wrap break-words pr-1 leading-4"
                    style={{ height: "3rem", color: text ? theme.node.text : theme.node.placeholder }}
                    onScroll={(event) => {
                        const element = event.currentTarget;
                        followBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 12;
                    }}
                >
                    {content}
                </div>
            ) : null}
        </div>
    );
}
