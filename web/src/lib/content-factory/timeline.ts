export type TimelineSection = { id: string; startMs: number; endMs: number; durationMs: number };

export function timelineSections(items: Array<{ id: string; durationMs: number }>): TimelineSection[] {
    let cursor = 0;
    return items.map((item) => {
        const durationMs = Math.max(1_000, item.durationMs || 5_000);
        const section = { id: item.id, startMs: cursor, endMs: cursor + durationMs, durationMs };
        cursor += durationMs;
        return section;
    });
}

export function clampPlayhead(value: number, sections: TimelineSection[]) {
    return Math.max(0, Math.min(value, sections.at(-1)?.endMs || 0));
}

export function sectionAtTime(sections: TimelineSection[], timeMs: number) {
    return sections.find((section, index) => timeMs >= section.startMs && (timeMs < section.endMs || index === sections.length - 1 && timeMs <= section.endMs)) || null;
}

export function timeFromTimelinePoint(clientX: number, railLeft: number, scrollLeft: number, pixelsPerSecond: number) {
    return Math.max(0, ((clientX - railLeft + scrollLeft) / Math.max(1, pixelsPerSecond)) * 1_000);
}

export function wheelToHorizontalDelta(event: Pick<WheelEvent, "deltaX" | "deltaY" | "shiftKey">) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX;
    return event.deltaY;
}

export function isTimelineShortcutTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) || Boolean(target.closest("[role=button],[role=combobox],[role=listbox],[role=option],.ant-modal-root,.ant-select-dropdown"));
}
