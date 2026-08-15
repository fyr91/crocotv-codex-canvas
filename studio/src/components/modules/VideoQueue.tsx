"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, Copy, Download, Trash2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { VideoTask, API_URL } from "@/lib/api";
import { getAssetUrl } from "@/lib/utils";

interface VideoQueueProps {
    tasks: VideoTask[];
    onRemix: (task: VideoTask) => void;
}

export default function VideoQueue({ tasks, onRemix }: VideoQueueProps) {
    const tv = useTranslations("video");
    const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");

    const filteredTasks = tasks.filter(t => {
        if (filter === "all") return true;
        if (filter === "processing") return t.status === "pending" || t.status === "processing";
        return t.status === filter;
    }).reverse(); // Newest first

    const processingCount = tasks.filter(t => t.status === "pending" || t.status === "processing").length;

    return (
        <div className="h-full flex flex-col bg-surface border-l border-border-subtle">
            {/* Header & Tabs */}
            <div className="p-4 border-b border-border-subtle">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-medium text-foreground">{tv("taskQueue")}</h3>
                    <div className="text-sm font-mono text-text-muted flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${processingCount > 0 ? "bg-status-completed-bg animate-pulse" : "bg-elevated"}`} />
                        GPU: {processingCount > 0 ? "Running" : "Idle"}
                    </div>
                </div>

                <div className="flex bg-glass rounded-lg p-1 gap-1">
                    {[
                        { id: "all", label: tv("all") },
                        { id: "processing", label: tv("processing") },
                        { id: "completed", label: tv("completed") },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as any)}
                            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${filter === tab.id
                                ? "bg-hover-bg text-foreground font-medium shadow-sm"
                                : "text-text-muted hover:text-text-secondary"
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence mode="popLayout">
                    {filteredTasks.map((task) => (
                        <TaskCard key={task.id} task={task} onRemix={onRemix} />
                    ))}

                    {filteredTasks.length === 0 && (
                        <div className="text-center py-10 text-text-muted text-sm">
                            {tv("noTasks")}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function TaskCard({ task, onRemix }: { task: VideoTask; onRemix: (t: VideoTask) => void }) {
    const tv = useTranslations("video");
    const isCompleted = task.status === "completed";
    const isProcessing = task.status === "processing" || task.status === "pending";
    const isFailed = task.status === "failed";


    const getDisplayUrl = (url: string) => {
        return getAssetUrl(url);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`rounded-xl overflow-hidden border transition-all ${isProcessing ? "bg-glass border-glass-border" :
                isFailed ? "bg-status-failed-bg border-status-failed-border" :
                    "bg-surface border-glass-border hover:border-glass-border"
                }`}
        >
            {/* Processing State (Compact) */}
            {isProcessing && (
                <div className="p-3 flex gap-3 items-center">
                    <div className="w-12 h-12 rounded bg-surface/50 relative overflow-hidden flex-shrink-0">
                        {task.image_url ? (
                            <img
                                src={getDisplayUrl(task.image_url)}
                                alt="Input"
                                className="w-full h-full object-cover opacity-60"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/30 text-primary text-sm font-medium">
                                R2V
                            </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={16} />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-mono text-text-secondary">#{task.id.slice(0, 6)}</span>
                            <span className="text-sm text-primary animate-pulse">
                                {task.status === "pending" ? tv("queued") : tv("generating")}
                            </span>
                        </div>
                        <p className="text-sm text-text-secondary truncate">{task.prompt}</p>
                    </div>
                </div>
            )}

            {/* Completed State (Detailed) */}
            {isCompleted && (
                <div>
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-border-subtle flex justify-between items-center bg-glass">
                        <span className="text-sm font-mono text-text-muted">#{task.id.slice(0, 6)}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onRemix(task)}
                                className="text-sm flex items-center gap-1 text-text-secondary hover:text-foreground transition-colors"
                                title={tv("remixTitle")}
                            >
                                <RefreshCw size={12} /> Remix
                            </button>
                        </div>
                    </div>

                    {/* Visual Comparison */}
                    <div className="flex h-32 relative group">
                        {/* Input Image/Videos (Left) */}
                        <div className="w-1/2 relative border-r border-glass-border">
                            {task.image_url ? (
                                <img src={getDisplayUrl(task.image_url)} alt="Input" className="w-full h-full object-cover" />
                            ) : task.reference_video_urls && task.reference_video_urls.length > 0 ? (
                                /* R2V: Show reference video thumbnails */
                                <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-primary/20">
                                    {task.reference_video_urls.slice(0, 4).map((url, idx) => (
                                        <div key={idx} className="relative bg-surface overflow-hidden">
                                            <video
                                                src={getAssetUrl(url)}
                                                className="w-full h-full object-cover"
                                                muted
                                                preload="metadata"
                                            />
                                            <div className="absolute bottom-0.5 left-0.5 bg-primary/80 px-1 rounded text-sm text-foreground font-medium">
                                                @{String.fromCharCode(65 + idx)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary/50 text-sm font-medium">
                                    R2V Input
                                </div>
                            )}
                            <div className="absolute top-2 left-2 bg-surface px-1.5 py-0.5 rounded text-sm text-text-secondary">Input</div>
                        </div>

                        {/* Output Video (Right) */}
                        <div className="w-1/2 relative bg-black">
                            {task.video_url ? (
                                <video
                                    src={getAssetUrl(task.video_url)}
                                    controls
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-status-failed-fg text-sm">
                                    Error
                                </div>
                            )}
                            <div className="absolute top-2 right-2 bg-primary/80 px-1.5 py-0.5 rounded text-sm text-foreground">Result</div>
                        </div>
                    </div>

                    {/* Prompt & Actions */}
                    <div className="p-3">
                        <p className="text-sm text-text-secondary line-clamp-2 mb-3 hover:line-clamp-none transition-all cursor-help">
                            {task.prompt}
                        </p>

                        <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                                <button className="p-1.5 hover:bg-hover-bg rounded text-text-secondary hover:text-foreground">
                                    <Copy size={14} />
                                </button>
                                <button className="p-1.5 hover:bg-hover-bg rounded text-text-secondary hover:text-foreground">
                                    <Download size={14} />
                                </button>
                            </div>
                            <button className="p-1.5 hover:bg-status-failed-bg rounded text-text-muted hover:text-status-failed-fg">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Failed State */}
            {isFailed && (
                <div className="p-3">
                    <div className="flex items-center gap-2 text-status-failed-fg mb-2">
                        <AlertCircle size={16} />
                        <span className="text-sm font-medium">{tv("genFailed")}</span>
                    </div>
                    <p className="text-sm text-text-muted mb-3">{tv("unknownError")}</p>
                    <button
                        onClick={() => onRemix(task)}
                        className="w-full py-1.5 bg-glass hover:bg-hover-bg rounded text-sm text-text-secondary transition-colors"
                    >
                        {tv("retryTask")}
                    </button>
                </div>
            )}
        </motion.div>
    );
}
