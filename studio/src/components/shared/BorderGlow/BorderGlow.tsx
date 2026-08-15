"use client";

import type { ReactNode } from "react";
import "./BorderGlow.css";

interface BorderGlowProps {
    children: ReactNode;
    className?: string;
    edgeSensitivity?: number;
    glowColor?: string;
    backgroundColor?: string;
    borderRadius?: number;
    glowRadius?: number;
    glowIntensity?: number;
    coneSpread?: number;
    animated?: boolean;
    colors?: [string, string, string];
    fillOpacity?: number;
}

/**
 * API-compatible container for former glow call sites.
 * CrocoTV's protocol uses a quiet raised surface instead of cursor-driven
 * gradients, so visual-only glow props are intentionally ignored.
 */
export default function BorderGlow({ children, className = "" }: BorderGlowProps) {
    return (
        <div className={`border-glow-card ${className}`}>
            <div className="border-glow-inner">{children}</div>
        </div>
    );
}
