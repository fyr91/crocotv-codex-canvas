import { useEffect, useRef } from "react";

export function ManagedCanvasVideo({ src }: { src: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.src = src;
        video.load();

        return () => {
            video.pause();
            video.removeAttribute("src");
            video.load();
        };
    }, [src]);

    return <video ref={videoRef} controls preload="metadata" className="h-full w-full rounded-[18px] bg-black object-contain" data-canvas-no-zoom />;
}
