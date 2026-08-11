// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "antd";
import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import type { CourseFlowProject, CourseFlowSegment } from "@/types/course-flow";
import { AudioRegenerationModal, BatchAudioRegenerationModal, courseAudioConfigForRegeneration } from "./components/audio-regeneration-modal";
import { AudioStep } from "./components/audio-step";
import { AudioWaveformRow } from "./components/audio-waveform-row";
import { CourseFlowStepCache, CourseFlowSteps } from "./components/course-flow-steps";
import { CreateRoleModal } from "./components/create-role-modal";
import { EnhanceScriptModal } from "./components/enhance-script-modal";
import { RoleStep } from "./components/role-step";
import { SceneRegenerationModal } from "./components/scene-regeneration-modal";
import { ScriptInputModal } from "./components/script-input-modal";
import * as scriptInputModule from "./components/script-input-modal";
import { ScriptSceneStep } from "./components/script-scene-step";
import { VideoPlanningStep } from "./components/video-planning-step";
import { VideoStep } from "./components/video-step";
import CourseFlowPage from "./index";

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

const segment: CourseFlowSegment = {
    id: "segment-1", position: 0, text: "第一段课程文案", voiceDirection: "自然清晰", revision: 1,
    confirmedScriptRevision: null,
    confirmedPlanAudioId: null,
    selectedAudioId: "audio-2",
    audioVersions: [
        { id: "audio-1", version: 1, sourceSegmentRevision: 1, assetId: "asset-1", url: "/one.mp3", durationMs: 3000, status: "ready", errorMessage: null, played: true },
        { id: "audio-2", version: 2, sourceSegmentRevision: 1, assetId: "asset-2", url: "/two.mp3", durationMs: 3200, status: "ready", errorMessage: null, played: false },
    ],
    ltxVideo: null,
    materialShots: [],
};

const readyStoryboardShot = {
    id: "shot-1",
    position: 0,
    prompt: "抽象数据流动画",
    durationSeconds: 3.2,
    sourceSegmentRevision: 1,
    sourceAudioVersionId: "audio-2",
    storyboardPrompt: "分镜 Prompt",
    storyboardSourcePrompt: "抽象数据流动画",
    storyboardAssetId: "storyboard-asset",
    storyboardUrl: "/storyboard.png",
    storyboardGenerationId: "storyboard-generation",
    storyboardStatus: "ready" as const,
    storyboardErrorMessage: null,
    storyboardClientRequestId: "storyboard-request",
    video: null,
};

describe("Course Flow confirmed interaction contracts", () => {
    it("exports the independent workspace route component", () => {
        expect(CourseFlowPage).toBeTypeOf("function");
    });
    it("keeps reached steps accessible after viewing an earlier step", () => {
        const onSelect = vi.fn();
        render(<CourseFlowSteps current="role" availableThrough="video" onSelect={onSelect} />);

        const plan = screen.getByRole("button", { name: /视频规划/ }) as HTMLButtonElement;
        const video = screen.getByRole("button", { name: /视频生成/ }) as HTMLButtonElement;
        const exportStep = screen.getByRole("button", { name: /导出/ }) as HTMLButtonElement;
        expect(plan.disabled).toBe(false);
        expect(video.disabled).toBe(false);
        expect(exportStep.disabled).toBe(true);

        fireEvent.click(video);
        expect(onSelect).toHaveBeenCalledWith("video");
    });
    it("preserves visited step state while deactivating hidden effects", () => {
        const lifecycle = { effects: 0, cleanups: 0 };
        function Probe() {
            const [count, setCount] = useState(0);
            useEffect(() => {
                lifecycle.effects += 1;
                return () => { lifecycle.cleanups += 1; };
            }, []);
            return <button type="button" data-testid="cached-step" onClick={() => setCount((value) => value + 1)}>缓存内容 {count}</button>;
        }

        const view = render(<CourseFlowStepCache active><Probe /></CourseFlowStepCache>);
        fireEvent.click(screen.getByTestId("cached-step"));
        expect(screen.getByTestId("cached-step").textContent).toBe("缓存内容 1");
        expect(lifecycle).toEqual({ effects: 1, cleanups: 0 });

        view.rerender(<CourseFlowStepCache active={false}><Probe /></CourseFlowStepCache>);
        expect(lifecycle).toEqual({ effects: 1, cleanups: 1 });
        expect(screen.getByTestId("cached-step").parentElement?.getAttribute("aria-hidden")).toBe("true");

        view.rerender(<CourseFlowStepCache active><Probe /></CourseFlowStepCache>);
        expect(screen.getByTestId("cached-step").textContent).toBe("缓存内容 1");
        expect(lifecycle).toEqual({ effects: 2, cleanups: 1 });
        view.unmount();
        expect(lifecycle).toEqual({ effects: 2, cleanups: 2 });
    });
    it("does not preload unvisited steps and pauses cached media when leaving", () => {
        const mounted = vi.fn();
        const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
        const paused = vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
        function MediaProbe() {
            useEffect(() => { mounted(); }, []);
            return <audio aria-label="缓存音频" />;
        }

        try {
            const view = render(<CourseFlowStepCache active={false}><MediaProbe /></CourseFlowStepCache>);
            expect(mounted).not.toHaveBeenCalled();
            view.rerender(<CourseFlowStepCache active><MediaProbe /></CourseFlowStepCache>);
            expect(mounted).toHaveBeenCalledTimes(1);
            view.rerender(<CourseFlowStepCache active={false}><MediaProbe /></CourseFlowStepCache>);
            expect(mounted).toHaveBeenCalledTimes(1);
            expect(pause).toHaveBeenCalledTimes(1);
        } finally {
            pause.mockRestore();
            paused.mockRestore();
        }
    });
    it("reanalyzes cached audio only after its source URL changes", async () => {
        const fetchAudio = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
        vi.stubGlobal("fetch", fetchAudio);
        vi.stubGlobal("AudioContext", class {
            decodeAudioData = vi.fn().mockResolvedValue({ duration: 3.2, numberOfChannels: 1, getChannelData: () => Float32Array.from([0.2, 0.6, 1]) });
            close = vi.fn();
        });
        const props = { selected: true, onSelect: vi.fn(), onPlayed: vi.fn(), onRegenerate: vi.fn() };
        const view = render(<CourseFlowStepCache active><AudioWaveformRow audio={segment.audioVersions[0]} {...props} /></CourseFlowStepCache>);

        try {
            await screen.findByLabelText("真实音频波形");
            expect(fetchAudio).toHaveBeenCalledTimes(1);

            view.rerender(<CourseFlowStepCache active={false}><AudioWaveformRow audio={segment.audioVersions[0]} {...props} /></CourseFlowStepCache>);
            view.rerender(<CourseFlowStepCache active><AudioWaveformRow audio={segment.audioVersions[0]} {...props} /></CourseFlowStepCache>);
            await waitFor(() => expect(screen.getByLabelText("真实音频波形")).toBeTruthy());
            expect(fetchAudio).toHaveBeenCalledTimes(1);

            view.rerender(<CourseFlowStepCache active><AudioWaveformRow audio={{ ...segment.audioVersions[0], url: "/changed.mp3" }} {...props} /></CourseFlowStepCache>);
            await waitFor(() => expect(fetchAudio).toHaveBeenCalledTimes(2));
        } finally {
            view.unmount();
            vi.unstubAllGlobals();
        }
    });
    it("shows a hand cursor only on reachable workflow steps", () => {
        const view = render(<CourseFlowSteps current="role" availableThrough="video" onSelect={vi.fn()} />);

        expect(within(view.container).getByRole("button", { name: /视频规划/ }).classList.contains("cursor-pointer")).toBe(true);
        expect(within(view.container).getByRole("button", { name: /视频生成/ }).classList.contains("cursor-pointer")).toBe(true);
        expect(within(view.container).getByRole("button", { name: /导出/ }).classList.contains("disabled:cursor-default")).toBe(true);
    });
    it("shows role search without shared-role copy and keeps one design-sheet image in details", () => {
        const html = renderToStaticMarkup(<RoleStep roles={[{ id: "role-1", creatorId: "user-1", name: "林老师", description: "专业讲师", designSheetAssetId: "sheet", designSheetUrl: "/sheet.png", frontAssetId: "front", frontUrl: "/front.png", voiceId: "voice", voiceName: "兔子玉兰", previewAssetId: "preview", previewUrl: "/preview.mp3" }]} selectedRoleId="role-1" onSelect={vi.fn()} onCreate={vi.fn()} onNext={vi.fn()} />);
        expect(html).toContain("placeholder=\"搜索角色\"");
        expect(html).not.toContain("搜索共享角色");
        expect(html).not.toContain("Speaker ID");
        expect((html.match(/三视图/g) || [])).toHaveLength(1);
    });

    it("keeps explicit spacing between role search and the full role list", () => {
        const view = render(<RoleStep roles={[{ id: "role-1", creatorId: "user-1", name: "鳄鱼爸爸", description: "", designSheetAssetId: "sheet", designSheetUrl: "/sheet.png", frontAssetId: "front", frontUrl: "/front.png", voiceId: "voice", voiceName: "鳄鱼爸爸", previewAssetId: "preview", previewUrl: "/preview.mp3" }]} selectedRoleId="role-1" onSelect={vi.fn()} onCreate={vi.fn()} onNext={vi.fn()} />);

        try {
            const title = within(view.container).getByText("所有角色 · 1");
            expect(title.parentElement?.classList.contains("flex")).toBe(true);
            expect(title.classList.contains("mt-4")).toBe(true);
        } finally { view.unmount(); }
    });

    it("places a Chinese voice-preview action after the role detail title", () => {
        const view = render(<RoleStep roles={[{ id: "role-1", creatorId: "user-1", name: "鳄鱼爸爸", description: "", designSheetAssetId: "sheet", designSheetUrl: "/sheet.png", frontAssetId: "front", frontUrl: "/front.png", voiceId: "voice", voiceName: "鳄鱼爸爸", previewAssetId: "preview", previewUrl: "/preview.mp3" }]} selectedRoleId="role-1" onSelect={vi.fn()} onCreate={vi.fn()} onNext={vi.fn()} />);

        try {
            const title = screen.getByRole("heading", { level: 2, name: "鳄鱼爸爸" });
            const preview = screen.getByRole("button", { name: "播放鳄鱼爸爸试听" });
            expect(title.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(preview.textContent).toContain("试听角色声音");
            expect(screen.queryByText("Preview")).toBeNull();
        } finally { view.unmount(); }
    });

    it("centers the role detail title and voice-preview action on the same control row", () => {
        const view = render(<RoleStep roles={[{ id: "role-1", creatorId: "user-1", name: "鳄鱼爸爸", description: "", designSheetAssetId: "sheet", designSheetUrl: "/sheet.png", frontAssetId: "front", frontUrl: "/front.png", voiceId: "voice", voiceName: "鳄鱼爸爸", previewAssetId: "preview", previewUrl: "/preview.mp3" }]} selectedRoleId="role-1" onSelect={vi.fn()} onCreate={vi.fn()} onNext={vi.fn()} />);

        try {
            const title = within(view.container).getByRole("heading", { level: 2, name: "鳄鱼爸爸" });
            const preview = within(view.container).getByRole("button", { name: "播放鳄鱼爸爸试听" });
            expect([...title.classList]).toEqual(expect.arrayContaining(["flex", "h-8", "items-center", "leading-none"]));
            expect(preview.classList.contains("h-8")).toBe(true);
        } finally { view.unmount(); }
    });

    it("replaces uploaded role filenames with image previews", async () => {
        render(<App><CreateRoleModal open config={{} as never} speechModel="speech-model" voices={[{ value: "voice-1", label: "鳄鱼爸爸" }]} onClose={vi.fn()} onCreated={vi.fn()} /></App>);
        const file = new File(["preview"], "role-sheet.png", { type: "image/png" });
        const input = document.querySelector<HTMLInputElement>('input[type="file"]');

        fireEvent.change(input!, { target: { files: [file] } });

        expect(await screen.findByAltText("包含三视图的角色图片预览")).toBeTruthy();
        expect(screen.queryByText("role-sheet.png")).toBeNull();
        expect(screen.queryByText("创建时会用固定的 CrocoTV 平台介绍文案生成试听音频，并将该声音绑定到角色。")).toBeNull();
    });

    it("selects audio versions with checkboxes and does not render redundant top generation controls", () => {
        const html = renderToStaticMarkup(<AudioStep segments={[segment]} batchRegenerating={false} onSelect={vi.fn()} onPlayed={vi.fn()} onRegenerate={vi.fn()} onRegenerateAll={vi.fn()} onNext={vi.fn()} />);
        expect((html.match(/type=\"checkbox\"/g) || [])).toHaveLength(2);
        expect(html).toContain("bg-blue-500");
        expect(html).not.toContain("生成缺失音频");
        expect(html).not.toContain("确认音频");
    });

    it("shows a pointer cursor on playable course audio buttons", () => {
        const view = render(<AudioStep segments={[segment]} batchRegenerating={false} onSelect={vi.fn()} onPlayed={vi.fn()} onRegenerate={vi.fn()} onRegenerateAll={vi.fn()} onNext={vi.fn()} />);

        try {
            expect(within(view.container).getAllByRole("button", { name: "播放" }).every((button) => button.classList.contains("cursor-pointer"))).toBe(true);
        } finally { view.unmount(); }
    });

    it("confirms the selected ready audio for planning and keeps the next-step contract unchanged", () => {
        const onConfirmPlan = vi.fn();
        const onNext = vi.fn();
        const props = { batchRegenerating: false, onSelect: vi.fn(), onPlayed: vi.fn(), onRegenerate: vi.fn(), onRegenerateAll: vi.fn(), onConfirmPlan, onNext };
        const view = render(<AudioStep {...props} segments={[segment]} />);

        fireEvent.click(within(view.container).getByRole("button", { name: "确认并生成规划" }));
        expect(onConfirmPlan).toHaveBeenCalledWith("segment-1");
        expect(within(view.container).getByRole("button", { name: "下一步：视频设置" })).toHaveProperty("disabled", false);

        view.rerender(<AudioStep {...props} segments={[{ ...segment, confirmedPlanAudioId: "audio-2" }]} />);
        expect(within(view.container).getByLabelText("规划已确认")).toBeTruthy();
        expect(within(view.container).queryByRole("button", { name: "确认并生成规划" })).toBeNull();
        view.unmount();
    });

    it("opens regeneration settings for the clicked Audio version", () => {
        const onRegenerate = vi.fn();
        render(<AudioStep segments={[segment]} batchRegenerating={false} onSelect={vi.fn()} onPlayed={vi.fn()} onRegenerate={onRegenerate} onDownload={vi.fn()} onRegenerateAll={vi.fn()} onNext={vi.fn()} />);

        fireEvent.click(screen.getAllByRole("button", { name: "重新生成音频" })[0]);

        expect(onRegenerate).toHaveBeenCalledWith("segment-1", "audio-1");
    });

    it("places a ready Audio download immediately after regenerate", () => {
        const onDownload = vi.fn();
        const view = render(<AudioStep segments={[segment]} batchRegenerating={false} onSelect={vi.fn()} onPlayed={vi.fn()} onRegenerate={vi.fn()} onDownload={onDownload} onRegenerateAll={vi.fn()} onNext={vi.fn()} />);

        const row = within(view.container).getByText("版本 1").closest("div")!;
        const regenerate = within(row).getByRole("button", { name: "重新生成音频" });
        const download = within(row).getByRole("button", { name: "下载音频" });
        expect(regenerate.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(download);
        expect(onDownload).toHaveBeenCalledWith("segment-1", "audio-1");
    });

    it("opens batch Audio regeneration from the availability summary and disables it while Audio is generating", () => {
        const onRegenerateAll = vi.fn();
        const props = { onSelect: vi.fn(), onPlayed: vi.fn(), onRegenerate: vi.fn(), onRegenerateAll, onNext: vi.fn() };
        const view = render(<AudioStep {...props} segments={[segment]} batchRegenerating={false} />);

        const available = within(view.container).getByText("可用 1/1");
        const button = within(view.container).getByRole("button", { name: "重新生成全部音频" });
        expect(available.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(button);
        expect(onRegenerateAll).toHaveBeenCalledOnce();

        view.rerender(<AudioStep {...props} segments={[{ ...segment, audioVersions: [...segment.audioVersions, { ...segment.audioVersions[1], id: "audio-3", version: 3, status: "running", url: "", assetId: null }] }]} batchRegenerating={false} />);
        expect(within(view.container).getByRole("button", { name: "重新生成全部音频" })).toHaveProperty("disabled", true);
    });

    it("regenerates Audio with a compact settings row and plain script context", async () => {
        const onOptimize = vi.fn().mockResolvedValue("结尾放慢并加强重音");
        const onSubmit = vi.fn();
        const view = render(<App><AudioRegenerationModal
            open
            segmentText="第一段课程文案"
            initialValues={{ voiceDirection: "自然清晰", speed: "1", volume: "1", pitch: "0", format: "wav" }}
            onClose={vi.fn()}
            onOptimize={onOptimize}
            onSubmit={onSubmit}
        /></App>);

        try {
            const modal = within(screen.getByText("重新生成音频").closest('[role="dialog"]')!);
            expect(modal.getByText("第一段课程文案")).toBeTruthy();
            expect(modal.queryByLabelText("片段文案")).toBeNull();
            expect(modal.queryByText("角色音色")).toBeNull();
            expect(modal.queryByText("鳄鱼爸爸")).toBeNull();
            expect(modal.queryByText("输出格式")).toBeNull();
            const speedItem = modal.getByLabelText("语速").closest(".ant-form-item");
            const volumeItem = modal.getByLabelText("音量").closest(".ant-form-item");
            const pitchItem = modal.getByLabelText("音高").closest(".ant-form-item");
            expect(speedItem?.parentElement).toBe(volumeItem?.parentElement);
            expect(speedItem?.parentElement).toBe(pitchItem?.parentElement);
            const voiceDirection = screen.getByPlaceholderText("描述情绪、语速、停顿和重音");
            fireEvent.change(voiceDirection, { target: { value: "结尾慢一点" } });
            fireEvent.click(screen.getByRole("button", { name: "优化语气指导" }));
            await waitFor(() => expect(onOptimize).toHaveBeenCalledWith("结尾慢一点"));
            await waitFor(() => expect((voiceDirection as HTMLTextAreaElement).value).toBe("结尾放慢并加强重音"));
            fireEvent.change(screen.getByLabelText("语速"), { target: { value: "1.25" } });
            fireEvent.change(screen.getByLabelText("音量"), { target: { value: "1.5" } });
            fireEvent.change(screen.getByLabelText("音高"), { target: { value: "2" } });
            fireEvent.click(screen.getByRole("button", { name: "生成新版本" }));

            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
                voiceDirection: "结尾放慢并加强重音",
                speed: "1.25",
                volume: "1.5",
                pitch: "2",
                format: "wav",
            }));
        } finally { view.unmount(); }
    });

    it("maps every editable regeneration setting into the Speech request config", () => {
        expect(courseAudioConfigForRegeneration({ audioSpeed: "1", audioVolume: "1", audioPitch: "0", audioFormat: "mp3" } as never, {
            voiceDirection: "自然",
            speed: "1.25",
            volume: "1.5",
            pitch: "2",
            format: "wav",
        })).toEqual(expect.objectContaining({ audioSpeed: "1.25", audioVolume: "1.5", audioPitch: "2", audioFormat: "wav" }));
    });

    it("regenerates every Audio version from one compact batch-settings modal", async () => {
        const onSubmit = vi.fn();
        const view = render(<App><BatchAudioRegenerationModal
            open
            initialValues={{ speed: "1", volume: "1", pitch: "0", format: "wav" }}
            onClose={vi.fn()}
            onSubmit={onSubmit}
        /></App>);

        try {
            const modal = within(screen.getByText("重新生成全部音频").closest('[role="dialog"]')!);
            expect(modal.getByText("将沿用每个片段当前的文案和语气指导，并为每个片段新增一个音频版本。")).toBeTruthy();
            expect(modal.queryByText("片段文案")).toBeNull();
            expect(modal.queryByText("角色音色")).toBeNull();
            expect(modal.queryByText("语气指导")).toBeNull();
            expect(modal.queryByText("输出格式")).toBeNull();
            fireEvent.change(modal.getByLabelText("语速"), { target: { value: "1.25" } });
            fireEvent.change(modal.getByLabelText("音量"), { target: { value: "1.5" } });
            fireEvent.change(modal.getByLabelText("音高"), { target: { value: "2" } });
            fireEvent.click(modal.getByRole("button", { name: "生成全部新版本" }));

            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ speed: "1.25", volume: "1.5", pitch: "2", format: "wav" }));
        } finally { view.unmount(); }
    });

    it("renders a shrinkable real waveform without hiding trailing actions and resolves missing audio duration", async () => {
        const samples = Float32Array.from({ length: 192 }, (_, index) => index % 4 === 0 ? 1 : index % 3 === 0 ? 0.5 : 0.1);
        const close = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
        vi.stubGlobal("AudioContext", class {
            decodeAudioData = vi.fn().mockResolvedValue({ duration: 3.2, numberOfChannels: 1, getChannelData: () => samples });
            close = close;
        });
        const onDurationResolved = vi.fn();

        try {
            const view = render(<AudioWaveformRow {...({
                audio: { ...segment.audioVersions[0], durationMs: 0 },
                selected: true,
                onSelect: vi.fn(),
                onPlayed: vi.fn(),
                onRegenerate: vi.fn(),
                onDurationResolved,
            } as any)} />);

            const waveform = await screen.findByLabelText("真实音频波形");
            const bars = waveform.querySelectorAll("[data-waveform-bar]");
            expect(waveform.classList.contains("min-w-0")).toBe(true);
            expect(waveform.classList.contains("w-full")).toBe(false);
            expect(bars.length).toBeGreaterThan(64);
            expect(new Set([...bars].map((bar) => (bar as HTMLElement).style.height)).size).toBeGreaterThan(2);
            expect(await within(view.container).findByText("00:03")).toBeTruthy();
            await waitFor(() => expect(onDurationResolved).toHaveBeenCalledWith(3200));
            expect(close).toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });

    it("keeps the existing audio while the new version uses an in-progress skeleton", () => {
        const generatingSegment = {
            ...segment,
            audioVersions: [segment.audioVersions[0], { ...segment.audioVersions[1], assetId: null, url: "", durationMs: 0, status: "running" as const }],
            selectedAudioId: segment.audioVersions[1].id,
        };
        const view = render(<AudioStep segments={[generatingSegment]} batchRegenerating={false} onSelect={vi.fn()} onPlayed={vi.fn()} onRegenerate={vi.fn()} onRegenerateAll={vi.fn()} onNext={vi.fn()} />);

        const placeholder = within(view.container).getByRole("status");
        expect(placeholder.textContent).toContain("版本 2");
        expect(within(placeholder).getByLabelText("音频生成波形").querySelectorAll(".ant-skeleton-input")).toHaveLength(1);
        expect(placeholder.querySelectorAll(".ant-skeleton-paragraph")).toHaveLength(0);
        const regenerateButtons = within(view.container).getAllByRole("button", { name: "重新生成音频" });
        expect(regenerateButtons).toHaveLength(2);
        expect(regenerateButtons[1]).toHaveProperty("disabled", true);
        const pendingPlay = within(placeholder).getByRole("button", { name: "播放" });
        expect(pendingPlay).toHaveProperty("disabled", true);
        expect(pendingPlay.classList.contains("disabled:cursor-not-allowed")).toBe(true);
        expect(within(view.container).getAllByRole("checkbox")).toHaveLength(2);
    });

    it("shows a failed audio version as an error instead of a loading skeleton", () => {
        const view = render(<AudioWaveformRow
            audio={{ ...segment.audioVersions[0], assetId: null, url: "", durationMs: 0, status: "failed", errorMessage: "音频生成已超时或中断，请重新生成" }}
            selected={false}
            onSelect={vi.fn()}
            onPlayed={vi.fn()}
            onRegenerate={vi.fn()}
        />);

        expect(within(view.container).getByRole("alert").textContent).toBe("音频生成已超时或中断，请重新生成");
        expect(view.container.querySelector(".ant-skeleton-input")).toBeNull();
        expect(within(view.container).getByRole("button", { name: "重新生成音频" })).toHaveProperty("disabled", false);
    });

    it("renders every segment immediately while only prompt regions are planning", () => {
        const segments = Array.from({ length: 6 }, (_, index) => ({
            ...segment,
            id: `segment-${index + 1}`,
            position: index,
            text: `课程文案 ${index + 1}`,
            selectedAudioId: `audio-${index + 1}`,
            audioVersions: [{ ...segment.audioVersions[1], id: `audio-${index + 1}`, durationMs: 12_000 }],
        }));
        const view = render(<VideoPlanningStep
            segments={segments}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set(segments.map((item) => item.id))}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getAllByRole("article")).toHaveLength(6);
        expect(within(view.container).getByText("课程文案 1")).toBeTruthy();
        expect(within(view.container).getAllByText("正在规划本片段的内容画面")).toHaveLength(6);
        expect(within(view.container).getAllByRole("status", { name: /分镜图生成中/ })).toHaveLength(6);
        expect(within(view.container).getAllByRole("button", { name: /重新生成片段 \d{2} 的画面素材提示词/ })).toHaveLength(6);
        expect(within(view.container).getByRole("button", { name: "生成视频" })).toHaveProperty("disabled", true);
    });

    it("lays content-sized segments on a horizontal rail and fills the storyboard loading area", () => {
        const runningShot = { ...readyStoryboardShot, storyboardUrl: "", storyboardStatus: "running" as const };
        const longText = "这是一段明显超过三行的课程文案，用来确认所有片段的文案区域始终保持相同高度，并在超出三行后显示省略号，而不会把后续画面卡片向下推开。";
        const view = render(<VideoPlanningStep
            segments={[
                { ...segment, text: longText, materialShots: [runningShot, { ...runningShot, id: "shot-2", position: 1 }] },
                { ...segment, id: "segment-2", position: 1, text: "短文案", materialShots: [{ ...readyStoryboardShot, id: "shot-3" }] },
            ]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />);

        const page = within(view.container).getByRole("region", { name: "视频规划页面" });
        expect(page.classList.contains("overflow-y-auto")).toBe(true);
        const rail = within(view.container).getByRole("region", { name: "视频规划片段横向列表" });
        expect(rail.closest(".max-w-\\[1120px\\]")).toBeNull();
        expect(rail.parentElement?.classList.contains("w-full")).toBe(true);
        expect(rail.classList.contains("overflow-x-auto")).toBe(true);
        expect(rail.classList.contains("overflow-y-auto")).toBe(false);
        expect(rail).toHaveProperty("tabIndex", 0);
        expect(rail.firstElementChild?.classList.contains("items-stretch")).toBe(true);
        const articles = within(rail).getAllByRole("article");
        expect(articles.every((item) => item.classList.contains("flex") && item.classList.contains("flex-col"))).toBe(true);
        const article = articles[0];
        expect(article.classList.contains("shrink-0")).toBe(true);
        expect(article.classList.contains("w-full")).toBe(false);
        expect(within(article).getByText(longText).classList.contains("line-clamp-3")).toBe(true);
        const shots = within(article).getByRole("list", { name: "片段 01 画面列表" });
        expect(shots.classList.contains("flex")).toBe(true);
        expect(shots.classList.contains("flex-1")).toBe(true);
        expect(shots.classList.contains("items-stretch")).toBe(true);
        expect(shots.classList.contains("grid")).toBe(false);
        expect(within(shots).getAllByRole("listitem").every((item) => item.classList.contains("shrink-0") && item.classList.contains("flex-col"))).toBe(true);
        expect(within(rail).getAllByRole("textbox", { name: /片段 \d+ 画面 \d+ 提示词/ }).every((input) => input.getAttribute("rows") === "4")).toBe(true);
        const loading = within(shots).getByRole("status", { name: "片段 01 画面 01 分镜图生成中" });
        expect(loading.classList.contains("p-3")).toBe(false);
        expect(loading.firstElementChild?.classList.contains("!h-full")).toBe(true);
        expect(loading.firstElementChild?.classList.contains("!w-full")).toBe(true);
    });

    it("previews the selected audio across each segment beneath its description", () => {
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            materialStylePrompt="现代科普课程视觉，简洁专业，明亮自然，统一真实场景加手绘风格结合"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />);
        const article = within(view.container).getByRole("article", { name: "片段 1 视频规划" });
        const description = within(article).getByText("第一段课程文案");
        const preview = within(article).getByRole("group", { name: "片段 01 已选音频预览" });
        const shots = within(article).getByRole("list", { name: "片段 01 画面列表" });
        const media = within(preview).getByLabelText("片段 01 已选音频") as HTMLAudioElement;
        let paused = true;
        Object.defineProperty(media, "paused", { configurable: true, get: () => paused });
        media.play = vi.fn().mockImplementation(async () => { paused = false; fireEvent.play(media); });
        media.pause = vi.fn().mockImplementation(() => { paused = true; fireEvent.pause(media); });

        expect(preview.classList.contains("w-full")).toBe(true);
        expect(description.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(preview.compareDocumentPosition(shots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(preview).getByText("已选音频 · 00:03")).toBeTruthy();
        fireEvent.click(within(preview).getByRole("button", { name: "播放片段 01 已选音频" }));
        expect(within(preview).getByRole("button", { name: "暂停片段 01 已选音频" })).toBeTruthy();
        fireEvent.click(within(preview).getByRole("button", { name: "暂停片段 01 已选音频" }));
        expect(within(preview).getByRole("button", { name: "播放片段 01 已选音频" })).toBeTruthy();
    });

    it("moves the horizontal segment rail continuously without snapping", () => {
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot, { ...readyStoryboardShot, id: "shot-2", position: 1 }] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />);
        const rail = within(view.container).getByRole("region", { name: "视频规划片段横向列表" });
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        }));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        Object.defineProperties(rail, {
            clientWidth: { configurable: true, value: 320 },
            scrollWidth: { configurable: true, value: 960 },
            scrollLeft: { configurable: true, value: 0, writable: true },
            setPointerCapture: { configurable: true, value: vi.fn() },
            releasePointerCapture: { configurable: true, value: vi.fn() },
        });

        try {
            expect(rail.classList.contains("snap-x")).toBe(false);
            expect(within(rail).getAllByRole("article").every((item) => !item.classList.contains("snap-start"))).toBe(true);

            fireEvent.wheel(rail, { deltaX: 0, deltaY: 120 });
            expect(rail.scrollLeft).toBe(0);
            frames.shift()?.(0);
            expect(rail.scrollLeft).toBeGreaterThan(0);
            expect(rail.scrollLeft).toBeLessThan(120);
            for (let index = 0; index < 40 && frames.length; index += 1) frames.shift()?.(index + 1);
            expect(rail.scrollLeft).toBeCloseTo(120, 0);

            fireEvent.pointerDown(rail, { button: 0, clientX: 200, pointerId: 7 });
            fireEvent.pointerMove(rail, { clientX: 140, pointerId: 7 });
            expect(rail.scrollLeft).toBeCloseTo(180, 0);
            fireEvent.pointerUp(rail, { clientX: 140, pointerId: 7 });
            frames.shift()?.(50);
            expect(rail.scrollLeft).toBeGreaterThan(180);
        } finally {
            view.unmount();
            vi.unstubAllGlobals();
        }
    });

    it("shows fresh material prompts with inline editing and content-only style guidance", () => {
        const onShotPromptChange = vi.fn();
        const onShotPromptSave = vi.fn();
        const onRegenerateSegment = vi.fn();
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={onRegenerateSegment}
            onShotPromptChange={onShotPromptChange}
            onShotPromptSave={onShotPromptSave}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByText("画面素材提示词")).toBeTruthy();
        expect(within(view.container).getByText("素材风格不会参与画面内容规划，只会在生成视频时与内容提示词组合。")).toBeTruthy();
        const prompt = within(view.container).getByDisplayValue("抽象数据流动画");
        fireEvent.change(prompt, { target: { value: "彗星飞过夜空" } });
        fireEvent.blur(prompt, { target: { value: "彗星飞过夜空" } });
        expect(onShotPromptChange).toHaveBeenCalledWith("shot-1", "彗星飞过夜空");
        expect(onShotPromptSave).toHaveBeenCalledWith("shot-1", "彗星飞过夜空");
        expect(within(view.container).queryByRole("button", { name: "优化画面提示词" })).toBeNull();
        expect(within(view.container).getByRole("img", { name: "片段 01 画面 01 分镜图" })).toBeTruthy();
        fireEvent.click(within(view.container).getByRole("button", { name: "重新生成片段 01 的画面素材提示词" }));
        expect(onRegenerateSegment).toHaveBeenCalledWith("segment-1");
        expect(within(view.container).getByRole("button", { name: "生成视频" })).toHaveProperty("disabled", false);
    });

    it("keeps previous prompts visible when a segment plan fails and offers one retry", () => {
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [{ ...readyStoryboardShot, prompt: "旧的内容画面", storyboardSourcePrompt: "旧的内容画面" }] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{ "segment-1": "模型超时" }}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByDisplayValue("旧的内容画面")).toBeTruthy();
        expect(within(view.container).getByRole("alert").textContent).toContain("模型超时");
        expect(within(view.container).getByRole("button", { name: "重新生成片段 01 的画面素材提示词" })).toBeTruthy();
    });

    it("opens the storyboard preview and regenerates from the image action", async () => {
        const onRegenerateStoryboard = vi.fn();
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={onRegenerateStoryboard}
            onNext={vi.fn()}
        />);

        fireEvent.click(within(view.container).getByRole("img", { name: "片段 01 画面 01 分镜图" }));
        expect(await screen.findByRole("img", { name: "片段 01 画面 01 分镜图放大预览" })).toBeTruthy();
        fireEvent.click(within(view.container).getByRole("button", { name: "重新生成片段 01 画面 01 分镜图" }));
        expect(onRegenerateStoryboard).toHaveBeenCalledWith("segment-1", "shot-1");
    });

    it("hides a cached step portal when navigating to another step", async () => {
        const planning = <VideoPlanningStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        />;
        const view = render(<App><CourseFlowStepCache active>{planning}</CourseFlowStepCache></App>);

        try {
            const existingPreviews = screen.queryAllByRole("img", { name: "片段 01 画面 01 分镜图放大预览" }).length;
            fireEvent.click(within(view.container).getByRole("img", { name: "片段 01 画面 01 分镜图" }));
            await waitFor(() => expect(screen.queryAllByRole("img", { name: "片段 01 画面 01 分镜图放大预览" })).toHaveLength(existingPreviews + 1));
            view.rerender(<App><CourseFlowStepCache active={false}>{planning}</CourseFlowStepCache></App>);
            await waitFor(() => expect(screen.queryAllByRole("img", { name: "片段 01 画面 01 分镜图放大预览" })).toHaveLength(existingPreviews));
        } finally {
            view.unmount();
        }
    });

    it("browses storyboard previews in page order and shows each complete material prompt", async () => {
        const secondShot = { ...readyStoryboardShot, id: "shot-2", position: 0, prompt: "彗星飞过深邃夜空，长尾从画面右上延伸到左下。", storyboardSourcePrompt: "彗星飞过深邃夜空，长尾从画面右上延伸到左下。", storyboardUrl: "/storyboard-2.png" };
        const view = render(<App><VideoPlanningStep
            segments={[
                { ...segment, materialShots: [{ ...readyStoryboardShot, prompt: "抽象数据流动画，蓝色光点沿着清晰路径向前流动。" }] },
                { ...segment, id: "segment-2", position: 1, materialShots: [secondShot] },
            ]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        try {
            fireEvent.click(within(view.container).getByRole("img", { name: "片段 01 画面 01 分镜图" }));
            const dialog = (await screen.findAllByRole("dialog")).find((item) => within(item).queryByText("1 / 2"));
            expect(dialog).toBeTruthy();
            if (!dialog) return;
            expect(within(dialog).getByText("抽象数据流动画，蓝色光点沿着清晰路径向前流动。")).toBeTruthy();
            expect(within(dialog).queryByRole("textbox")).toBeNull();
            expect(within(dialog).getByText("1 / 2")).toBeTruthy();
            expect(within(dialog).getByRole("button", { name: "上一张分镜图" })).toHaveProperty("disabled", true);

            fireEvent.click(within(dialog).getByRole("button", { name: "下一张分镜图" }));
            expect(await within(dialog).findByRole("img", { name: "片段 02 画面 01 分镜图放大预览" })).toBeTruthy();
            expect(within(dialog).getByText("彗星飞过深邃夜空，长尾从画面右上延伸到左下。")).toBeTruthy();
            expect(within(dialog).getByRole("button", { name: "下一张分镜图" })).toHaveProperty("disabled", true);

            fireEvent.keyDown(document, { key: "ArrowLeft" });
            expect(await within(dialog).findByRole("img", { name: "片段 01 画面 01 分镜图放大预览" })).toBeTruthy();
        } finally { view.unmount(); }
    });

    it("keeps one storyboard regenerate action beside duration and leaves the stale warning informational", () => {
        const onRegenerateStoryboard = vi.fn();
        const view = render(<VideoPlanningStep
            segments={[{ ...segment, materialShots: [{ ...readyStoryboardShot, prompt: "修改后的画面" }] }]}
            materialStylePrompt="现代科普课程视觉"
            planningSegmentIds={new Set()}
            planningErrors={{}}
            savingStyle={false}
            onStyleChange={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onShotPromptChange={vi.fn()}
            onShotPromptSave={vi.fn()}
            onRegenerateStoryboard={onRegenerateStoryboard}
            onNext={vi.fn()}
        />);

        const durationActions = within(view.container).getByText("3.2 秒").parentElement;
        expect(durationActions).toBeTruthy();
        if (!durationActions) return;
        fireEvent.click(within(durationActions).getByRole("button", { name: "重新生成片段 01 画面 01 分镜图" }));
        expect(onRegenerateStoryboard).toHaveBeenCalledWith("segment-1", "shot-1");

        const warning = within(view.container).getByText("提示词已修改，请重新生成分镜").closest(".ant-alert");
        expect(warning).toBeTruthy();
        if (!warning) return;
        expect(within(warning).queryByRole("button")).toBeNull();
        expect(within(view.container).getByRole("button", { name: "生成视频" })).toHaveProperty("disabled", true);
    });

    it("keeps prompt editing in planning and shows only video regeneration in the generation step", () => {
        const view = render(<VideoStep
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            exporting={false}
            onRegenerateLtx={vi.fn()}
            onRegenerateShot={vi.fn()}
            onExport={vi.fn()}
        />);

        expect(within(view.container).queryByRole("textbox")).toBeNull();
        expect(within(view.container).queryByRole("button", { name: "优化提示词" })).toBeNull();
        expect(within(view.container).getAllByRole("button", { name: "重新生成" })).toHaveLength(2);
    });

    it("shows only MiniMax H3 content videos for a general course", () => {
        const view = render(<VideoStep
            sceneMode="general"
            segments={[{ ...segment, materialShots: [readyStoryboardShot] }]}
            exporting={false}
            onRegenerateLtx={vi.fn()}
            onRegenerateShot={vi.fn()}
            onExport={vi.fn()}
        />);

        expect(within(view.container).queryByText("角色绿幕视频")).toBeNull();
        expect(within(view.container).getByText("内容视频")).toBeTruthy();
        expect(within(view.container).getAllByRole("button", { name: "重新生成" })).toHaveLength(1);
    });

    it("submits the project scene ratio without binding the Modal to generation loading", async () => {
        const onSubmit = vi.fn();
        render(<App><ScriptInputModal
            open
            projectSceneMode="green_screen"
            initialAspectRatio="4:3"
            ratioOptions={[{ label: "16:9", value: "16:9" }, { label: "4:3", value: "4:3" }]}
            onClose={vi.fn()}
            onSubmit={onSubmit}
        /></App>);

        fireEvent.change(screen.getByPlaceholderText("例如：生成式 AI 如何改变日常工作"), { target: { value: "AI 办公效率" } });
        fireEvent.change(screen.getByPlaceholderText("例如：希望提升效率的职场新人"), { target: { value: "职场新人" } });
        fireEvent.click(screen.getByRole("button", { name: "生成文案与场景" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mode: "generated", sceneAspectRatio: "4:3" })));
    });

    it("defaults the first course requirement to general and keeps the chosen mode in the request", async () => {
        const onSubmit = vi.fn();
        const view = render(<App><ScriptInputModal
            open
            projectSceneMode={null}
            initialAspectRatio="16:9"
            ratioOptions={[{ label: "16:9", value: "16:9" }]}
            onClose={vi.fn()}
            onSubmit={onSubmit}
        /></App>);

        const dialog = within(screen.getAllByRole("dialog").at(-1)!);
        fireEvent.change(dialog.getByPlaceholderText("例如：生成式 AI 如何改变日常工作"), { target: { value: "AI 办公效率" } });
        fireEvent.change(dialog.getByPlaceholderText("例如：希望提升效率的职场新人"), { target: { value: "职场新人" } });
        fireEvent.click(dialog.getByRole("button", { name: /生成/ }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sceneMode: "general" })));
    });

    it("prefills generated requirements and keeps the persisted course mode read-only", () => {
        const view = render(<App><ScriptInputModal
            open
            projectSceneMode="general"
            initialAspectRatio="16:9"
            initialInput={{ mode: "generated", topic: "生成式 AI 入门", audience: "职场新人", extraPrompt: "控制在五分钟", sceneMode: "general", sceneAspectRatio: "16:9" }}
            ratioOptions={[{ label: "16:9", value: "16:9" }]}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
        /></App>);

        try {
            const dialog = within(screen.getAllByRole("dialog").at(-1)!);
            expect(dialog.getByPlaceholderText("例如：生成式 AI 如何改变日常工作")).toHaveProperty("value", "生成式 AI 入门");
            expect(dialog.getByPlaceholderText("例如：希望提升效率的职场新人")).toHaveProperty("value", "职场新人");
            expect(dialog.getByPlaceholderText("语气、时长或需要重点说明的内容")).toHaveProperty("value", "控制在五分钟");
            expect(dialog.getByText("通用课程视频")).toBeTruthy();
            expect(dialog.getAllByRole("combobox")[0]).toHaveProperty("disabled", true);
        } finally { view.unmount(); }
    });

    it("prefills pasted requirements from the current segments in position order", () => {
        const project: CourseFlowProject = {
            id: "project-1", title: "课程", currentStep: "script_scene", roleId: "role-1", sourceType: "pasted",
            topic: "", audience: "", extraPrompt: "", sceneMode: "general", sceneAspectRatio: "16:9",
            materialStylePrompt: "现代科普课程视觉", resolution: "720p",
        };
        const buildInitialInput = (scriptInputModule as typeof scriptInputModule & {
            buildCourseScriptInitialInput: (project: CourseFlowProject, segments: CourseFlowSegment[]) => unknown;
        }).buildCourseScriptInitialInput;

        expect(buildInitialInput(project, [
            { ...segment, id: "segment-2", position: 1, text: "第二段课程文案" },
            segment,
        ])).toEqual({ mode: "pasted", text: "第一段课程文案\n\n第二段课程文案", sceneMode: "general", sceneAspectRatio: "16:9" });
    });

    it("renders a general course as a script-only step without scene requirements", () => {
        const onSaveSegment = vi.fn();
        const second = { ...segment, id: "segment-2", position: 1, text: "第二段课程文案", voiceDirection: "轻松自然" };
        const view = render(<App><ScriptSceneStep
            sceneMode="general"
            segments={[segment, second]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={onSaveSegment}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        expect(within(view.container).getByRole("heading", { name: "课程文案" })).toBeTruthy();
        const rail = within(view.container).getByRole("region", { name: "课程文案片段横向列表" });
        expect(rail.classList.contains("overflow-x-auto")).toBe(true);
        expect(within(rail).getAllByRole("article")).toHaveLength(2);
        expect(within(view.container).getByTestId("course-script-content").className).toContain("overflow-y-auto");
        expect(within(view.container).getByTestId("course-script-footer").className).toContain("shrink-0");
        expect(within(rail).getAllByText("课程内容")).toHaveLength(2);
        expect(within(rail).getAllByText("语气指导")).toHaveLength(2);
        expect(within(rail).getAllByTestId("course-segment-fields")[0].className).toContain("gap-4");
        const contentInput = within(rail).getAllByRole("textbox", { name: "课程内容" })[0];
        fireEvent.change(contentInput, { target: { value: "更新后的课程文案" } });
        fireEvent.blur(contentInput);
        expect(onSaveSegment).toHaveBeenCalledWith("segment-1", { text: "更新后的课程文案" });
        expect(within(view.container).queryByRole("button", { name: "重新生成场景" })).toBeNull();
        expect(within(view.container).getByRole("button", { name: "进入音频" })).toHaveProperty("disabled", false);
        view.unmount();
    });

    it("moves the course script rail with the mouse wheel and pointer drag", () => {
        const second = { ...segment, id: "segment-2", position: 1, text: "第二段课程文案", voiceDirection: "轻松自然" };
        const view = render(<App><ScriptSceneStep
            sceneMode="general" segments={[segment, second]} scene={null}
            scriptGenerating={false} scriptEnhancing={false} sceneGenerating={false} aspectRatio="16:9"
            regeneratingSegmentIds={new Set()} onOpenInput={vi.fn()} onEnhance={vi.fn()}
            onSaveSegment={vi.fn()} onRegenerateSegment={vi.fn()} onRegenerateScene={vi.fn()} onNext={vi.fn()}
        /></App>);
        const rail = within(view.container).getByRole("region", { name: "课程文案片段横向列表" });
        const contentInput = within(rail).getAllByRole("textbox", { name: "课程内容" })[0];
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        }));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        Object.defineProperties(rail, {
            clientWidth: { configurable: true, value: 320 },
            scrollWidth: { configurable: true, value: 960 },
            scrollLeft: { configurable: true, value: 0, writable: true },
            setPointerCapture: { configurable: true, value: vi.fn() },
            releasePointerCapture: { configurable: true, value: vi.fn() },
        });

        try {
            fireEvent.wheel(rail, { deltaX: 0, deltaY: 120 });
            expect(rail.scrollLeft).toBe(0);
            frames.shift()?.(0);
            expect(rail.scrollLeft).toBeGreaterThan(0);
            for (let index = 0; index < 40 && frames.length; index += 1) frames.shift()?.(index + 1);
            expect(rail.scrollLeft).toBeCloseTo(120, 0);

            fireEvent.wheel(contentInput, { deltaX: 0, deltaY: 120 });
            expect(frames).toHaveLength(0);
            expect(rail.scrollLeft).toBeCloseTo(120, 0);

            fireEvent.pointerDown(rail, { button: 0, clientX: 200, pointerId: 7 });
            fireEvent.pointerMove(rail, { clientX: 140, pointerId: 7 });
            expect(rail.scrollLeft).toBeCloseTo(180, 0);
            fireEvent.pointerUp(rail, { clientX: 140, pointerId: 7 });
            frames.shift()?.(50);
            expect(rail.scrollLeft).toBeGreaterThan(180);
        } finally {
            view.unmount();
            vi.unstubAllGlobals();
        }
    });

    it("uses a full-width course script rail with fixed editors and a dashed add button", () => {
        const second = { ...segment, id: "segment-2", position: 1, text: "第二段课程文案", voiceDirection: "轻松自然" };
        const view = render(<App><ScriptSceneStep
            sceneMode="general" segments={[segment, second]} scene={null}
            scriptGenerating={false} scriptEnhancing={false} sceneGenerating={false} aspectRatio="16:9"
            regeneratingSegmentIds={new Set()} onOpenInput={vi.fn()} onEnhance={vi.fn()}
            onSaveSegment={vi.fn()} onRegenerateSegment={vi.fn()} onRegenerateScene={vi.fn()} onNext={vi.fn()}
        /></App>);

        const rail = within(view.container).getByRole("region", { name: "课程文案片段横向列表" });
        expect(rail.closest("section")?.classList.contains("max-w-[1440px]")).toBe(false);
        expect(rail.parentElement?.classList.contains("w-full")).toBe(true);
        expect(rail.parentElement?.classList.contains("px-4")).toBe(true);
        const contentInputs = within(rail).getAllByRole("textbox", { name: "课程内容" });
        const voiceInputs = within(rail).getAllByRole("textbox", { name: "语气指导" });
        expect(contentInputs.every((input) => input.style.height === "176px" && input.style.resize === "none" && input.classList.contains("!overflow-y-auto"))).toBe(true);
        expect(voiceInputs.every((input) => input.style.height === "80px" && input.style.resize === "none" && input.classList.contains("!overflow-y-auto"))).toBe(true);
        const add = within(rail).getByRole("button", { name: "在片段 01 和片段 02 之间新增片段" });
        expect(add.classList.contains("!border-dashed")).toBe(true);
        expect(add.classList.contains("!bg-transparent")).toBe(true);
        expect(add.classList.contains("!text-muted-foreground")).toBe(true);
        expect(add.classList.contains("hover:!border-solid")).toBe(true);
        expect(add.classList.contains("hover:!bg-[var(--surface-raised)]")).toBe(true);
        expect(add.classList.contains("hover:!text-foreground")).toBe(true);
        expect(add.classList.contains("focus-visible:!border-solid")).toBe(true);
        expect(add.classList.contains("focus-visible:!bg-[var(--surface-raised)]")).toBe(true);
        expect(add.classList.contains("focus-visible:!text-foreground")).toBe(true);
        view.unmount();
    });

    it("keeps course script control bars constrained while the card rail remains full width", () => {
        const second = { ...segment, id: "segment-2", position: 1, text: "第二段课程文案", voiceDirection: "轻松自然" };
        const view = render(<App><ScriptSceneStep
            sceneMode="general" segments={[segment, second]} scene={null}
            scriptGenerating={false} scriptEnhancing={false} sceneGenerating={false} aspectRatio="16:9"
            regeneratingSegmentIds={new Set()} onOpenInput={vi.fn()} onEnhance={vi.fn()}
            onSaveSegment={vi.fn()} onRegenerateSegment={vi.fn()} onRegenerateScene={vi.fn()} onNext={vi.fn()}
        /></App>);

        const rail = within(view.container).getByRole("region", { name: "课程文案片段横向列表" });
        const toolbar = within(view.container).getByText("课程文案 · 2 个片段").parentElement!;
        const footer = within(view.container).getByTestId("course-script-footer");
        expect(toolbar.closest(".max-w-\\[1440px\\]")).toBeTruthy();
        expect(footer.closest(".max-w-\\[1440px\\]")).toBeTruthy();
        expect(rail.closest(".max-w-\\[1440px\\]")).toBeNull();
        view.unmount();
    });

    it("shows the course brief form immediately when entering an empty script and scene step", () => {
        const view = render(<App><ScriptSceneStep
            segments={[]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            scriptInput={{
                ratioOptions: [{ label: "16:9", value: "16:9" }],
                onSubmit: vi.fn(),
            }}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        expect(within(view.container).getByPlaceholderText("例如：生成式 AI 如何改变日常工作")).toBeTruthy();
        expect(within(view.container).getByPlaceholderText("例如：希望提升效率的职场新人")).toBeTruthy();
        expect(within(view.container).getByRole("button", { name: "生成文案与场景" })).toBeTruthy();
        expect(within(view.container).queryByRole("button", { name: "开始制作课程" })).toBeNull();
    });

    it("shows separate script and visual-framework skeletons as soon as generation starts", () => {
        const view = render(<ScriptSceneStep
            segments={[]}
            scene={null}
            scriptGenerating
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            scriptInput={{ ratioOptions: [{ label: "16:9", value: "16:9" }], onSubmit: vi.fn() }}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByRole("status", { name: "课程文案生成中" })).toBeTruthy();
        expect(within(view.container).getByRole("status", { name: "视觉框架生成中" })).toBeTruthy();
    });

    it("confirms a script with a persistent check and exposes compact regenerate and delete actions", async () => {
        const onConfirmSegment = vi.fn();
        const onDeleteSegment = vi.fn();
        const view = render(<App><ScriptSceneStep
            segments={[segment]}
            scene={{ assetId: "scene", url: "/scene.png", prompt: "", status: "ready", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onConfirmSegment={onConfirmSegment}
            onDeleteSegment={onDeleteSegment}
            onNext={vi.fn()}
        /></App>);

        fireEvent.click(within(view.container).getByRole("button", { name: "确认并生成音频" }));
        expect(onConfirmSegment).toHaveBeenCalledWith("segment-1");
        expect(within(view.container).getByRole("button", { name: "重新生成片段" })).toBeTruthy();
        fireEvent.click(within(view.container).getByRole("button", { name: "删除片段" }));
        fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
        expect(onDeleteSegment).toHaveBeenCalledWith("segment-1");

        view.rerender(<App><ScriptSceneStep
            segments={[{ ...segment, confirmedScriptRevision: segment.revision }]}
            scene={{ assetId: "scene", url: "/scene.png", prompt: "", status: "ready", errorMessage: null }}
            scriptGenerating={false} scriptEnhancing={false} sceneGenerating={false} aspectRatio="16:9"
            regeneratingSegmentIds={new Set()} onOpenInput={vi.fn()} onEnhance={vi.fn()} onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()} onRegenerateScene={vi.fn()} onConfirmSegment={onConfirmSegment}
            onDeleteSegment={onDeleteSegment} onNext={vi.fn()}
        /></App>);
        expect(within(view.container).getByLabelText("文案已确认")).toBeTruthy();
        expect(within(view.container).queryByRole("button", { name: "确认并生成音频" })).toBeNull();
        view.unmount();
    });

    it("inserts a requested segment only after submitting the divider Modal", async () => {
        const onInsertSegment = vi.fn();
        const second = { ...segment, id: "segment-2", position: 1, text: "第二段课程文案" };
        const view = render(<App><ScriptSceneStep
            segments={[segment, second]}
            scene={{ assetId: "scene", url: "/scene.png", prompt: "", status: "ready", errorMessage: null }}
            scriptGenerating={false} scriptEnhancing={false} sceneGenerating={false} aspectRatio="16:9"
            regeneratingSegmentIds={new Set()} insertingDividerKeys={new Set()}
            onOpenInput={vi.fn()} onEnhance={vi.fn()} onSaveSegment={vi.fn()} onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()} onInsertSegment={onInsertSegment} onNext={vi.fn()}
        /></App>);

        const add = within(view.container).getByRole("button", { name: "在片段 01 和片段 02 之间新增片段" });
        fireEvent.click(add);
        let dialog = screen.getByText("新增片段").closest('[role="dialog"]')!;
        fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
        expect(onInsertSegment).not.toHaveBeenCalled();

        fireEvent.click(add);
        dialog = screen.getByText("新增片段").closest('[role="dialog"]')!;
        fireEvent.change(within(dialog).getByLabelText("片段要求"), { target: { value: "补充一个生活化例子" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "生成并插入" }));
        await waitFor(() => expect(onInsertSegment).toHaveBeenCalledWith("segment-1", "segment-2", "补充一个生活化例子"));
        view.unmount();
    });

    it("requires and trims a course enhancement instruction while explaining retained media", async () => {
        const onSubmit = vi.fn();
        const view = render(<App><EnhanceScriptModal open onClose={vi.fn()} onSubmit={onSubmit} /></App>);

        try {
            expect(screen.getByText("优化课程文案").closest(".ant-modal")).toBeTruthy();
            expect(screen.getByText("已有视频会保留；进入音频步骤时，文案有变化的片段会自动清空旧音频并重新生成。")).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "开始优化" }));
            expect(await screen.findByText("请填写优化要求")).toBeTruthy();

            fireEvent.change(screen.getByLabelText("优化要求"), { target: { value: "  整体更适合小学生  " } });
            fireEvent.click(screen.getByRole("button", { name: "开始优化" }));
            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("整体更适合小学生"));
        } finally { view.unmount(); }
    });

    it("opens scene regeneration with current-scene reference enabled and requires an instruction", async () => {
        const view = render(<App><SceneRegenerationModal open onClose={vi.fn()} onSubmit={vi.fn()} /></App>);

        try {
            expect(screen.getByText("重新生成课程场景").closest(".ant-modal")).toBeTruthy();
            expect((screen.getByRole("checkbox", { name: "参考当前场景图进行优化" }) as HTMLInputElement).checked).toBe(true);
            fireEvent.click(screen.getByRole("button", { name: "生成场景" }));
            expect(await screen.findByText("请输入本次调整要求")).toBeTruthy();
        } finally { view.unmount(); }
    });

    it("submits a new scene instruction without the current image when unchecked", async () => {
        const onSubmit = vi.fn();
        const view = render(<App><SceneRegenerationModal open onClose={vi.fn()} onSubmit={onSubmit} /></App>);

        try {
            fireEvent.change(screen.getByPlaceholderText("描述希望保留或调整的画面内容"), { target: { value: "把电视放大" } });
            fireEvent.click(screen.getByRole("checkbox", { name: "参考当前场景图进行优化" }));
            fireEvent.click(screen.getByRole("button", { name: "生成场景" }));

            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ instruction: "把电视放大", referenceCurrentScene: false }));
        } finally { view.unmount(); }
    });

    it("renders scene output at the project ratio without an environment description field", () => {
        const html = renderToStaticMarkup(<ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "最终图片提示词", assetId: null, url: "", status: "queued", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating
            aspectRatio="4:3"
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            regeneratingSegmentIds={new Set()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(html).toContain("aspect-ratio:4/3");
        expect(html).not.toContain("环境描述");
        expect(html).not.toContain("场景描述");
    });

    it("fills the scene preview with its loading state and reports prompt optimization progress", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "", assetId: null, url: "", status: "queued", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        const loadingSurface = within(view.container).getByTestId("course-scene-loading");
        expect(loadingSurface.classList.contains("size-full")).toBe(true);
        expect(within(view.container).getByLabelText("课程场景生成进度").textContent).toBe("正在优化场景提示词…");
    });

    it("covers the previous scene with loading while regenerating", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "旧提示词", assetId: "old-scene", url: "/old-scene.png", status: "queued", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByTestId("course-scene-loading")).toBeTruthy();
        expect(within(view.container).queryByAltText("绿幕课程场景")).toBeNull();
    });

    it("offers image-library and upload actions on the course scene preview", async () => {
        const onChoose = vi.fn();
        const onUpload = vi.fn().mockResolvedValue(false);
        const view = render(<App><ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "课程场景", assetId: "scene-1", url: "/scene.png", status: "ready", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            sceneMediaActions={{ replacing: false, onChoose, onUpload }}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        try {
            const preview = within(view.container).getByAltText("绿幕课程场景").parentElement as HTMLElement;
            const choose = within(preview).getByRole("button", { name: "从素材库选择课程场景" });
            const upload = within(preview).getByRole("button", { name: "上传课程场景" });
            expect(choose.parentElement?.className).toContain("absolute");
            fireEvent.click(choose);
            expect(onChoose).toHaveBeenCalledOnce();

            const file = new File(["scene"], "scene.png", { type: "image/png" });
            const input = upload.closest(".ant-upload")?.querySelector<HTMLInputElement>('input[type="file"]');
            fireEvent.change(input!, { target: { files: [file] } });
            await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
        } finally { view.unmount(); }
    });

    it("disables every scene write while a selected or uploaded scene is saving", () => {
        const view = render(<App><ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "上传场景", assetId: null, url: "/scene-preview.png", status: "running", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            sceneMediaActions={{ replacing: true, onChoose: vi.fn(), onUpload: vi.fn() }}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        try {
            expect(within(view.container).getByRole("status", { name: "课程场景保存中" })).toBeTruthy();
            expect(within(view.container).getByRole("button", { name: "从素材库选择课程场景" })).toHaveProperty("disabled", true);
            expect(within(view.container).getByRole("button", { name: "上传课程场景" })).toHaveProperty("disabled", true);
            expect(within(view.container).getByRole("button", { name: "重新生成场景" })).toHaveProperty("disabled", true);
            expect(within(view.container).getByRole("button", { name: "进入音频" })).toHaveProperty("disabled", true);
        } finally { view.unmount(); }
    });

    it("reports scene image generation without naming the model", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={{ prompt: "最终图片提示词", assetId: null, url: "", status: "running", errorMessage: null }}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating
            aspectRatio="4:3"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByLabelText("课程场景生成进度").textContent).toBe("正在生成课程场景…");
    });

    it("removes manual voice optimization from generated course segments", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).queryByRole("button", { name: "优化语气指导" })).toBeNull();
        expect(within(view.container).getByRole("button", { name: "重新生成片段" })).toBeTruthy();
    });

    it("collects a required optimization direction before regenerating one course segment", async () => {
        const onRegenerateSegment = vi.fn();
        const view = render(<App><ScriptSceneStep
            segments={[segment]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={onRegenerateSegment}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        /></App>);

        try {
            fireEvent.click(within(view.container).getByRole("button", { name: "重新生成片段" }));
            const modal = screen.getByText("重新生成课程片段").closest(".ant-modal") as HTMLElement;
            expect(modal).toBeTruthy();
            expect(onRegenerateSegment).not.toHaveBeenCalled();

            fireEvent.click(within(modal).getByRole("button", { name: "重新生成片段" }));
            expect(await within(modal).findByText("请输入本次优化方向")).toBeTruthy();

            fireEvent.change(within(modal).getByLabelText("本次优化方向"), { target: { value: "  讲得更生动，并增加生活类比  " } });
            fireEvent.click(within(modal).getByRole("button", { name: "重新生成片段" }));
            await waitFor(() => expect(onRegenerateSegment).toHaveBeenCalledWith("segment-1", "讲得更生动，并增加生活类比"));
        } finally { view.unmount(); }
    });

    it("replaces a regenerating segment with an explicit in-progress state", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set([segment.id])}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByRole("status").textContent).toContain("片段重新生成中");
        expect(within(view.container).queryByDisplayValue("第一段课程文案")).toBeNull();
        expect(within(view.container).queryByRole("button", { name: "重新生成片段" })).toBeNull();
    });

    it("places the course enhancement action at the right side of the script title bar", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing={false}
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        const title = within(view.container).getByText("课程文案 · 1 个片段");
        const action = within(view.container).getByRole("button", { name: "优化文案" });
        expect(title.parentElement).toBe(action.parentElement);
    });

    it("replaces the whole script list with an enhancement progress state", () => {
        const view = render(<ScriptSceneStep
            segments={[segment]}
            scene={null}
            scriptGenerating={false}
            scriptEnhancing
            sceneGenerating={false}
            aspectRatio="16:9"
            regeneratingSegmentIds={new Set()}
            onOpenInput={vi.fn()}
            onEnhance={vi.fn()}
            onSaveSegment={vi.fn()}
            onRegenerateSegment={vi.fn()}
            onRegenerateScene={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(within(view.container).getByRole("status").textContent).toContain("课程文案优化中");
        expect(within(view.container).queryByDisplayValue(segment.text)).toBeNull();
    });
});
