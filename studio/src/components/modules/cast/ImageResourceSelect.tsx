"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ImageIcon } from "lucide-react";
import clsx from "clsx";
import type { PulledCharacterResource } from "@/lib/pulledCharacterAssets";

interface ImageResourceSelectProps {
  resources: PulledCharacterResource[];
  value: string;
  onChange: (resourceId: string) => void;
  placeholder: string;
  ariaLabel: string;
}

function ResourceThumbnail({ resource, className }: { resource?: PulledCharacterResource; className?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [resource?.id, resource?.url]);

  return (
    <span className={clsx("grid shrink-0 place-items-center overflow-hidden rounded-md border border-glass-border bg-black/25", className)}>
      {resource && !failed ? (
        <img
          src={resource.url}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon size={15} className="text-text-muted" aria-hidden="true" />
      )}
    </span>
  );
}

export default function ImageResourceSelect({
  resources,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: ImageResourceSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectedResource = resources.find((resource) => resource.id === value);
  const options: Array<PulledCharacterResource | undefined> = [undefined, ...resources];

  const openMenu = () => {
    const selectedIndex = selectedResource
      ? Math.max(0, resources.findIndex((resource) => resource.id === selectedResource.id) + 1)
      : 0;
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  };

  const choose = (resource?: PulledCharacterResource) => {
    onChange(resource?.id || "");
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => (current + direction + options.length) % options.length);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(options[highlightedIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative mt-1" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-option-${highlightedIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-glass-border bg-surface px-2 text-left text-foreground transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
      >
        <ResourceThumbnail resource={selectedResource} className="size-7" />
        <span className={clsx("min-w-0 flex-1 truncate text-sm", !selectedResource && "text-text-muted")}>
          {selectedResource?.name || placeholder}
        </span>
        <ChevronDown size={14} className={clsx("shrink-0 text-text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-y-auto rounded-lg border border-glass-border bg-elevated p-1.5 shadow-2xl"
        >
          {options.map((resource, index) => {
            const selected = (resource?.id || "") === value;
            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={resource?.id || "empty"}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => choose(resource)}
                className={clsx(
                  "flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
                  highlightedIndex === index ? "bg-hover-bg" : "hover:bg-hover-bg/70",
                )}
              >
                <ResourceThumbnail resource={resource} className="size-10" />
                <span className={clsx("min-w-0 flex-1 truncate text-sm", resource ? "text-foreground" : "text-text-muted")}>
                  {resource?.name || placeholder}
                </span>
                {selected ? <Check size={15} className="shrink-0 text-primary" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
