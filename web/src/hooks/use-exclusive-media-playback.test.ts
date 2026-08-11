import { describe, expect, it } from "vitest";

import { installExclusiveMediaPlayback } from "./use-exclusive-media-playback";

describe("exclusive media playback", () => {
    it("playing a second media pauses the first without resetting its position", () => {
        const root = fakeDocument();
        const first = fakeMedia({ paused: false, currentTime: 18 });
        const second = fakeMedia({ paused: false, currentTime: 3 });
        root.media = [first, second];

        const cleanup = installExclusiveMediaPlayback(root.document);
        root.play(second);

        expect(first.paused).toBe(true);
        expect(first.currentTime).toBe(18);
        expect(second.paused).toBe(false);
        cleanup();
    });

    it("exempt media neither interrupts nor is interrupted by user playback", () => {
        const root = fakeDocument();
        const userMedia = fakeMedia({ paused: false });
        const preview = fakeMedia({ paused: false, exempt: true });
        root.media = [userMedia, preview];

        const cleanup = installExclusiveMediaPlayback(root.document);
        root.play(preview);
        expect(userMedia.paused).toBe(false);

        root.play(userMedia);
        expect(preview.paused).toBe(false);
        cleanup();
    });

    it("skips the active media and media that are already paused", () => {
        const root = fakeDocument();
        const active = fakeMedia({ paused: false });
        const idle = fakeMedia({ paused: true });
        root.media = [active, idle];

        const cleanup = installExclusiveMediaPlayback(root.document);
        root.play(active);

        expect(active.pauseCalls).toBe(0);
        expect(idle.pauseCalls).toBe(0);
        cleanup();
    });

    it("cleanup removes the capture listener", () => {
        const root = fakeDocument();
        const cleanup = installExclusiveMediaPlayback(root.document);

        cleanup();

        expect(root.listener).toBeNull();
    });
});

function fakeMedia(options: { paused: boolean; currentTime?: number; exempt?: boolean }) {
    return {
        paused: options.paused,
        currentTime: options.currentTime || 0,
        pauseCalls: 0,
        matches: (selector: string) => selector === "video, audio",
        closest: (selector: string) => selector === "[data-media-playback-exempt]" && options.exempt ? {} : null,
        pause() {
            this.pauseCalls += 1;
            this.paused = true;
        },
    };
}

function fakeDocument() {
    type Media = ReturnType<typeof fakeMedia>;
    const root = {
        listener: null as EventListener | null,
        media: [] as Media[],
        document: {
            addEventListener(_type: string, listener: EventListener, capture?: boolean) {
                expect(capture).toBe(true);
                root.listener = listener;
            },
            removeEventListener(_type: string, listener: EventListener, capture?: boolean) {
                expect(capture).toBe(true);
                if (root.listener === listener) root.listener = null;
            },
            querySelectorAll() {
                return root.media;
            },
        } as unknown as Pick<Document, "addEventListener" | "removeEventListener" | "querySelectorAll">,
        play(media: Media) {
            root.listener?.({ target: media } as unknown as Event);
        },
    };
    return root;
}
