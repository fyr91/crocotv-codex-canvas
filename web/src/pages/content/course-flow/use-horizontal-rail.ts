import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

export function useHorizontalRail() {
    const [dragging, setDragging] = useState(false);
    const railRef = useRef<HTMLDivElement | null>(null);
    const motionFrame = useRef<number | null>(null);
    const wheelTarget = useRef<number | null>(null);
    const drag = useRef<{ pointerId: number; lastX: number; velocity: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => () => {
        if (motionFrame.current !== null) cancelAnimationFrame(motionFrame.current);
    }, []);

    const cancelMotion = () => {
        if (motionFrame.current !== null) cancelAnimationFrame(motionFrame.current);
        motionFrame.current = null;
        wheelTarget.current = null;
    };
    const animateWheel = () => {
        motionFrame.current = null;
        const rail = railRef.current;
        const target = wheelTarget.current;
        if (!rail || target === null) return;
        const distance = target - rail.scrollLeft;
        if (Math.abs(distance) < 0.5) {
            rail.scrollLeft = target;
            wheelTarget.current = null;
            return;
        }
        rail.scrollLeft += distance * 0.24;
        motionFrame.current = requestAnimationFrame(animateWheel);
    };
    const startInertia = (rail: HTMLDivElement, initialVelocity: number) => {
        if (prefersReducedMotion() || Math.abs(initialVelocity) < 0.5) return;
        let velocity = Math.max(-28, Math.min(28, initialVelocity));
        const advance = () => {
            motionFrame.current = null;
            const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
            const previous = rail.scrollLeft;
            rail.scrollLeft = Math.max(0, Math.min(max, previous + velocity));
            velocity *= 0.9;
            if (rail.scrollLeft !== previous && Math.abs(velocity) >= 0.35) motionFrame.current = requestAnimationFrame(advance);
        };
        motionFrame.current = requestAnimationFrame(advance);
    };
    const onWheel = (event: WheelEvent, rail: HTMLDivElement) => {
        if (event.ctrlKey || drag.current || (event.target as HTMLElement).closest("textarea,input")) return;
        const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        const delta = rawDelta * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rail.clientWidth : 1);
        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        const currentTarget = wheelTarget.current ?? rail.scrollLeft;
        const next = Math.max(0, Math.min(max, currentTarget + delta));
        const hasPendingMotion = Math.abs(currentTarget - rail.scrollLeft) >= 0.5;
        if (!delta || (next === currentTarget && !hasPendingMotion)) return;
        event.preventDefault();
        if (prefersReducedMotion()) {
            cancelMotion();
            rail.scrollLeft = next;
            return;
        }
        wheelTarget.current = next;
        if (motionFrame.current === null) motionFrame.current = requestAnimationFrame(animateWheel);
    };

    useEffect(() => {
        const rail = railRef.current;
        if (!rail) return;
        const handleWheel = (event: WheelEvent) => onWheel(event, rail);
        rail.addEventListener("wheel", handleWheel, { passive: false });
        return () => rail.removeEventListener("wheel", handleWheel);
    });

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("textarea,input,button,a")) return;
        cancelMotion();
        drag.current = { pointerId: event.pointerId, lastX: event.clientX, velocity: 0, moved: false };
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional for older browsers. */ }
        setDragging(true);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const distance = drag.current.lastX - event.clientX;
        const rail = event.currentTarget;
        drag.current.lastX = event.clientX;
        drag.current.velocity = Math.max(-28, Math.min(28, drag.current.velocity * 0.35 + distance * 0.65));
        drag.current.moved ||= Math.abs(distance) > 3;
        rail.scrollLeft = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, rail.scrollLeft + distance));
        if (drag.current.moved) event.preventDefault();
    };
    const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        suppressClick.current = drag.current.moved;
        const velocity = drag.current.velocity;
        const moved = drag.current.moved;
        drag.current = null;
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* The browser may have released capture already. */ }
        setDragging(false);
        if (moved) startInertia(event.currentTarget, velocity);
    };
    const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
    };

    return {
        railRef,
        dragging,
        onPointerDown,
        onPointerMove,
        onPointerUp: stopDrag,
        onPointerCancel: stopDrag,
        onClickCapture,
    };
}

function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
