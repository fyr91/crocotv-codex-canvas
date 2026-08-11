import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AudioLines, Image as ImageIcon, UploadCloud, Video } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
    uploading: boolean;
    uploadCount: number;
    onFiles: (files: File[]) => void;
};

export function AssetUploadDropzone({ uploading, uploadCount, onFiles }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const [dragActive, setDragActive] = useState(false);

    const chooseFiles = () => {
        if (!uploading) inputRef.current?.click();
    };

    const submitFiles = (files: FileList | null) => {
        if (!uploading && files?.length) onFiles(Array.from(files));
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        chooseFiles();
    };

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (uploading) return;
        dragDepthRef.current += 1;
        setDragActive(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setDragActive(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        submitFiles(event.dataTransfer.files);
    };

    return (
        <div
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-disabled={uploading}
            aria-label="上传图片、视频或音频素材"
            className={cn(
                "group relative flex min-h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-7 text-center outline-none transition",
                dragActive
                    ? "border-stone-950 bg-stone-100/90 dark:border-stone-100 dark:bg-stone-800/80"
                    : "border-stone-300 bg-background/70 hover:border-stone-500 hover:bg-stone-50/90 focus-visible:border-stone-950 dark:border-stone-700 dark:hover:border-stone-500 dark:hover:bg-stone-900/80 dark:focus-visible:border-stone-100",
                uploading && "cursor-wait opacity-70",
            )}
            onClick={chooseFiles}
            onKeyDown={handleKeyDown}
            onDragEnter={handleDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="flex max-w-xl flex-col items-center">
                <span className="grid size-11 place-items-center rounded-xl bg-stone-100 text-stone-700 transition group-hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:group-hover:bg-stone-700">
                    <UploadCloud className="size-5" />
                </span>
                <div className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-100">
                    {uploading ? `正在上传 ${uploadCount} 个素材…` : dragActive ? "松开即可上传" : "拖拽素材到这里，或点击选择文件"}
                </div>
                <div className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">支持单个或多个图片、视频和音频文件</div>
                <div className="mt-3 flex items-center gap-3 text-stone-400 dark:text-stone-500" aria-hidden="true">
                    <ImageIcon className="size-4" />
                    <Video className="size-4" />
                    <AudioLines className="size-4" />
                </div>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    submitFiles(event.target.files);
                    event.target.value = "";
                }}
            />
        </div>
    );
}
