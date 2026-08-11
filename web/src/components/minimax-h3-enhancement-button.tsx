import { App, Button, Tooltip } from "antd";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createMiniMaxH3Enhancement, getMiniMaxH3Enhancement, waitForMiniMaxH3Enhancement, type MiniMaxH3EnhancementJob } from "@/services/api/minimax-h3-enhancement";
import type { CloudAsset } from "@/services/api/cloud-assets";

export function MiniMaxH3EnhancementButton({ sourceAssetId, eligible, onReady, variant = "default" }: {
    sourceAssetId?: string | null;
    eligible: boolean;
    onReady?: (asset: CloudAsset) => void;
    variant?: "default" | "block" | "toolbar";
}) {
    const { message } = App.useApp();
    const [job, setJob] = useState<MiniMaxH3EnhancementJob | null>(null);
    const [starting, setStarting] = useState(false);
    const readyAssetId = useRef("");
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    useEffect(() => {
        readyAssetId.current = "";
        setJob(null);
        if (!eligible || !sourceAssetId) return;
        let active = true;
        void getMiniMaxH3Enhancement(sourceAssetId).then((value) => { if (active) setJob(value); }).catch(() => undefined);
        return () => { active = false; };
    }, [eligible, sourceAssetId]);

    useEffect(() => {
        if (!sourceAssetId || !job || !["queued", "running"].includes(job.status)) return;
        const controller = new AbortController();
        void waitForMiniMaxH3Enhancement(sourceAssetId, controller.signal, setJob).then((asset) => {
            if (readyAssetId.current === asset.id) return;
            readyAssetId.current = asset.id;
            setJob((current) => current ? { ...current, status: "succeeded", progress: 100, output_asset_id: asset.id } : current);
            onReadyRef.current?.(asset);
            message.success("高清修复完成");
        }).catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setJob((current) => current ? { ...current, status: "failed", error_message: error instanceof Error ? error.message : "高清修复失败" } : current);
            message.error(error instanceof Error ? error.message : "高清修复失败");
        });
        return () => controller.abort();
    }, [job?.id, job?.status, message, sourceAssetId]);

    useEffect(() => {
        if (!job?.output_asset_id || job.status !== "succeeded" || readyAssetId.current === job.output_asset_id || !sourceAssetId) return;
        const controller = new AbortController();
        void waitForMiniMaxH3Enhancement(sourceAssetId, controller.signal).then((asset) => {
            if (readyAssetId.current === asset.id) return;
            readyAssetId.current = asset.id;
            onReadyRef.current?.(asset);
        }).catch(() => undefined);
        return () => controller.abort();
    }, [job?.output_asset_id, job?.status, sourceAssetId]);

    if (!eligible || !sourceAssetId) return null;
    const active = starting || job?.status === "queued" || job?.status === "running";
    const done = job?.status === "succeeded";
    const label = done ? "高清版已完成" : active ? `高清修复 ${Math.max(0, Math.min(99, Number(job?.progress || 0)))}%` : job?.status === "failed" ? "重试高清修复" : "高清修复";
    const start = async () => {
        if (active || done) return;
        setStarting(true);
        setJob({ id: "pending", source_asset_id: sourceAssetId, status: "queued", stage: "queued", progress: 0 });
        try {
            setJob(await createMiniMaxH3Enhancement(sourceAssetId));
        } catch (error) {
            setJob((current) => current ? { ...current, status: "failed", error_message: error instanceof Error ? error.message : "高清修复启动失败" } : current);
            message.error(error instanceof Error ? error.message : "高清修复启动失败");
        } finally {
            setStarting(false);
        }
    };

    if (variant === "toolbar") return (
        <Tooltip title={label} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ root: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" disabled={active || done} className="group relative flex h-12 items-center whitespace-nowrap px-1.5 disabled:cursor-default disabled:opacity-60" onClick={() => void start()} aria-label={label}>
                <span className="flex h-9 items-center gap-2 rounded-lg px-2.5 transition group-hover:bg-[#f0f0f1]"><Sparkles className="size-4" /><span>{label}</span></span>
            </button>
        </Tooltip>
    );
    return <Button block={variant === "block"} loading={active} disabled={done} icon={<Sparkles className="size-4" />} onClick={() => void start()}>{label}</Button>;
}
