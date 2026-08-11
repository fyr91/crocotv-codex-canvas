import { create } from "zustand";

import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { useCanvasStore } from "./use-canvas-store";
import { uploadProgress } from "./canvas-upload-state";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasUploadKind = "image" | "video" | "audio";
export type CanvasUploadResult = UploadedImage | UploadedFile;
export type CanvasUploadTask = {
    id: string;
    projectId: string;
    nodeId: string;
    kind: CanvasUploadKind;
    localUrl: string;
    fileName: string;
    bytes: number;
    status: "uploading" | "success" | "error";
    progress: number;
    error?: string;
    result?: CanvasUploadResult;
};

type UploadPayload = {
    file: File;
};

type CanvasUploadStore = {
    tasks: Record<string, CanvasUploadTask>;
    startUpload: (input: Omit<CanvasUploadTask, "fileName" | "bytes" | "status" | "progress" | "error" | "result"> & UploadPayload) => void;
    retryUpload: (id: string) => void;
};

const payloads = new Map<string, UploadPayload>();

export const useCanvasUploadStore = create<CanvasUploadStore>()((set) => ({
    tasks: {},
    startUpload: (input) => {
        payloads.set(input.id, { file: input.file });
        set((state) => ({
            tasks: {
                ...state.tasks,
                [input.id]: {
                    id: input.id,
                    projectId: input.projectId,
                    nodeId: input.nodeId,
                    kind: input.kind,
                    localUrl: input.localUrl,
                    fileName: input.file.name,
                    bytes: input.file.size,
                    status: "uploading",
                    progress: 0,
                },
            },
        }));
        void runUpload(input.id);
    },
    retryUpload: (id) => {
        if (!payloads.has(id)) return;
        set((state) => {
            const task = state.tasks[id];
            return task ? { tasks: { ...state.tasks, [id]: { ...task, status: "uploading", progress: 0, error: undefined } } } : state;
        });
        void runUpload(id);
    },
}));

async function runUpload(id: string) {
    const task = useCanvasUploadStore.getState().tasks[id];
    const payload = payloads.get(id);
    if (!task || !payload) return;

    try {
        const onProgress = (uploadedBytes: number, totalBytes: number) => {
            const progress = uploadProgress(uploadedBytes, totalBytes);
            useCanvasUploadStore.setState((state) => {
                const current = state.tasks[id];
                if (!current || current.progress === progress) return state;
                return { tasks: { ...state.tasks, [id]: { ...current, progress } } };
            });
        };
        const result = task.kind === "image"
            ? await uploadImage(payload.file, { compress: true, onProgress })
            : await uploadMediaFile(payload.file, task.kind, { onProgress });
        const project = useCanvasStore.getState().projects.find((item) => item.id === task.projectId);
        const completedNode = project?.nodes.find((node) => node.id === task.nodeId);
        if (project && completedNode) {
            const nextNode = completeCanvasUploadNode(completedNode, task.kind, result);
            useCanvasStore.getState().updateProject(task.projectId, { nodes: project.nodes.map((node) => node.id === task.nodeId ? nextNode : node) });
        }
        useCanvasUploadStore.setState((state) => {
            const current = state.tasks[id];
            return current ? { tasks: { ...state.tasks, [id]: { ...current, status: "success", progress: 100, result } } } : state;
        });
        window.setTimeout(() => releaseUpload(id), 2000);
    } catch (error) {
        useCanvasUploadStore.setState((state) => {
            const current = state.tasks[id];
            if (!current) return state;
            return {
                tasks: {
                    ...state.tasks,
                    [id]: {
                        ...current,
                        status: "error",
                        error: error instanceof Error ? error.message : "上传失败，请重试",
                    },
                },
            };
        });
    }
}

export function completeCanvasUploadNode(node: CanvasNodeData, kind: CanvasUploadKind, result: CanvasUploadResult) {
    const naturalWidth = result.width;
    const naturalHeight = result.height;
    const size = naturalWidth && naturalHeight ? fitNodeSize(naturalWidth, naturalHeight, kind === "video" ? 420 : 640, kind === "video" ? 420 : 640) : null;
    const width = size?.width || node.width;
    const height = size?.height || node.height;
    return {
        ...node,
        position: size ? {
            x: node.position.x + node.width / 2 - width / 2,
            y: node.position.y + node.height / 2 - height / 2,
        } : node.position,
        width,
        height,
        metadata: {
            ...node.metadata,
            content: result.url,
            storageKey: result.storageKey,
            status: "success" as const,
            naturalWidth,
            naturalHeight,
            bytes: result.bytes,
            mimeType: result.mimeType,
            durationMs: "durationMs" in result ? result.durationMs : undefined,
            uploadTaskId: undefined,
            errorDetails: undefined,
        },
    };
}

function releaseUpload(id: string) {
    const task = useCanvasUploadStore.getState().tasks[id];
    if (task) URL.revokeObjectURL(task.localUrl);
    payloads.delete(id);
    useCanvasUploadStore.setState((state) => {
        const tasks = { ...state.tasks };
        delete tasks[id];
        return { tasks };
    });
}
