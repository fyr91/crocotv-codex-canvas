import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function PromptCover({ src, alt, className }: { src: string; alt: string; className?: string }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => setFailed(false), [src]);

    if (!src || failed) {
        return (
            <div className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-stone-100 text-xs text-stone-400 dark:bg-stone-900 dark:text-stone-500", className)}>
                <ImageOff className="size-6" />
                <span>暂无预览</span>
            </div>
        );
    }

    return <img src={src} alt={alt} className={cn("aspect-[4/3] w-full object-cover", className)} onError={() => setFailed(true)} />;
}
