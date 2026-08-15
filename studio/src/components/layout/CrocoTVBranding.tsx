"use client";

import clsx from "clsx";

export const CROCOTV_CANVAS_URL =
  process.env.NEXT_PUBLIC_CROCOTV_CANVAS_URL || "http://localhost:3000/canvas";

interface CrocoTVBrandingProps {
  className?: string;
}

/** Canonical CrocoTV brand link, matching the Canvas top navigation. */
export default function CrocoTVBranding({ className }: CrocoTVBrandingProps) {
  return (
    <a
      href={CROCOTV_CANVAS_URL}
      className={clsx(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-foreground transition-colors hover:bg-hover-bg",
        className,
      )}
      aria-label="CrocoTV"
    >
      <img src="/crocotv-icon.png" alt="" className="size-5 shrink-0" />
      <span className="text-base font-medium leading-none tracking-tight">CrocoTV</span>
    </a>
  );
}
