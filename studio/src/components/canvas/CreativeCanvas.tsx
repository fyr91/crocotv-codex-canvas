"use client";

/**
 * Decorative workspace surface shared by every Studio route.
 * The subtle 16px dot grid mirrors Croco Canvas without affecting content,
 * input, persistence, or any workflow behavior.
 */
export default function CreativeCanvas() {
    return <div className="studio-workspace-pattern absolute inset-0 h-full w-full" aria-hidden="true" />;
}
