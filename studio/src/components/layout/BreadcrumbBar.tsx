"use client";

import ThemeToggle from "./ThemeToggle";
import CrocoTVBranding from "./CrocoTVBranding";

export interface BreadcrumbSegment {
  label: string;
  hash?: string;
}

interface BreadcrumbBarProps {
  segments: BreadcrumbSegment[];
  actions?: React.ReactNode;
}

export default function BreadcrumbBar({ segments, actions }: BreadcrumbBarProps) {
  return (
    <div className="relative z-30 border-b border-glass-border bg-surface/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <CrocoTVBranding />
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <ThemeToggle />
        </div>
      </div>
      <nav className="mt-1.5 flex min-w-0 items-center gap-1.5 px-2 text-sm">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <span className="text-text-muted flex-shrink-0">&rsaquo;</span>}
              {seg.hash && !isLast ? (
                <a
                  href={seg.hash}
                  className="text-text-secondary hover:text-foreground transition-colors truncate"
                >
                  {seg.label}
                </a>
              ) : (
                <span className={isLast ? "text-foreground font-medium truncate" : "text-text-secondary truncate"}>
                  {seg.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
