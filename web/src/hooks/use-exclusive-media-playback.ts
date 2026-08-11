import { useEffect } from "react";

const MEDIA_SELECTOR = "video, audio";
const EXEMPT_SELECTOR = "[data-media-playback-exempt]";

export function installExclusiveMediaPlayback(root: Pick<Document, "addEventListener" | "removeEventListener" | "querySelectorAll">) {
    const handlePlay = (event: Event) => {
        const active = event.target;
        if (!isUserMedia(active)) return;
        root.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR).forEach((media) => {
            if (media !== active && !media.paused && !media.closest(EXEMPT_SELECTOR)) media.pause();
        });
    };
    root.addEventListener("play", handlePlay, true);
    return () => root.removeEventListener("play", handlePlay, true);
}

export function useExclusiveMediaPlayback() {
    useEffect(() => installExclusiveMediaPlayback(document), []);
}

function isUserMedia(target: EventTarget | null): target is HTMLMediaElement {
    return Boolean(target && "matches" in target && (target as Element).matches(MEDIA_SELECTOR) && !(target as Element).closest(EXEMPT_SELECTOR));
}
