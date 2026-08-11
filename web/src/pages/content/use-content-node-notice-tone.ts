import { useEffect, useRef } from "react";

import type { ContentNotificationMode } from "@/stores/use-content-production-ui-store";

type NoticeNode = {
    id: string;
    noticeUnread?: boolean;
    noticeKind?: "success" | "attention" | "failure" | null;
    noticeAt?: string | null;
};

export function useContentNodeNoticeTone(nodes: NoticeNode[], mode: ContentNotificationMode, ready = true) {
    const previous = useRef(new Set<string>());
    const initialized = useRef(false);
    useEffect(() => {
        if (!ready) return;
        const unread = nodes.filter((item) => item.noticeUnread && item.noticeKind);
        const signatures = unread.map(signature);
        if (!initialized.current) {
            initialized.current = true;
            previous.current = new Set(signatures);
            return;
        }
        const fresh = unread.filter((item) => !previous.current.has(signature(item)));
        previous.current = new Set(signatures);
        if (!fresh.length || mode === "mute") return;
        const highest = fresh.some((item) => item.noticeKind === "failure")
            ? "failure"
            : fresh.some((item) => item.noticeKind === "attention") ? "attention" : "success";
        playTone(highest);
    }, [mode, nodes, ready]);
}

function signature(node: NoticeNode) {
    return `${node.id}:${node.noticeAt || ""}`;
}

function playTone(kind: "success" | "attention" | "failure") {
    if (typeof window === "undefined" || !("AudioContext" in window)) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "failure" ? 220 : kind === "attention" ? 440 : 660;
    gain.gain.setValueAtTime(0.04, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
}
