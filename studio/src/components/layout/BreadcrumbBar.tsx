"use client";

import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import ThemeToggle from "./ThemeToggle";

export interface BreadcrumbSegment {
  label: string;
  hash?: string;
}

interface BreadcrumbBarProps {
  segments: BreadcrumbSegment[];
  actions?: React.ReactNode;
}

export default function BreadcrumbBar({ segments, actions }: BreadcrumbBarProps) {
  const tc = useTranslations("common");
  const handleBack = () => {
    if (segments.length >= 2 && segments[segments.length - 2].hash) {
      window.location.hash = segments[segments.length - 2].hash!;
    } else if (segments[0]?.hash) {
      window.location.hash = segments[0].hash;
    } else {
      window.location.hash = "";
    }
  };

  return (
    <div className="relative z-30 flex items-center gap-3 px-4 py-2.5 bg-surface/80 backdrop-blur-sm border-b border-glass-border">
      {/* Back arrow */}
      <button
        onClick={handleBack}
        className="flex items-center text-text-secondary hover:text-foreground transition-colors"
        title={tc("back")}
      >
        <ChevronLeft size={18} />
      </button>

      {/* Breadcrumb segments */}
      <nav className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
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

      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href="http://localhost:3000/canvas"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          aria-label="返回 CrocoTV"
        >
          <ChevronLeft size={14} />
          <span>CrocoTV</span>
        </a>
        {actions}
        <ThemeToggle />
      </div>
    </div>
  );
}
