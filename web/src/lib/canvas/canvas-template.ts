import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasTemplate } from "@/services/api/canvas-templates";

export function canvasTemplateProjectInput(template: CanvasTemplate): Partial<CanvasProject> {
    return {
        title: template.title,
        nodes: structuredClone(template.document.nodes || []),
        connections: structuredClone(template.document.connections || []),
        chatSessions: structuredClone(template.document.chatSessions || []),
        activeChatId: template.document.activeChatId || null,
        backgroundMode: "lines",
        showImageInfo: Boolean(template.document.showImageInfo),
        viewport: template.document.viewport || { x: 0, y: 0, k: 1 },
    };
}

export function templateNodeCounts(nodes: Array<Pick<CanvasNodeData, "type">>) {
    return nodes.reduce<Record<string, number>>((counts, node) => {
        counts.total += 1;
        counts[node.type] = (counts[node.type] || 0) + 1;
        return counts;
    }, { total: 0 });
}
