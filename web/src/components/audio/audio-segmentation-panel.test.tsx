// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AudioWaveformEditor } from "@/pages/content/components/audio-waveform-editor";
import { AudioNodePlayer } from "./audio-node-player";
import { AudioSegmentationPanel } from "./audio-segmentation-panel";

const vad = vi.hoisted(() => ({
    messages: [] as Array<{ audio: Float32Array; start: number; end: number }>,
    create: vi.fn(async () => ({
        run: async function* () {
            yield* vad.messages;
        },
    })),
}));

vi.mock("@ricky0123/vad-web", () => ({
    NonRealTimeVAD: {
        new: vad.create,
    },
}));

let decodedDurationSeconds = 30;
let decodedSampleRate = 1000;

class TestAudioBuffer {
    readonly length: number;
    readonly sampleRate: number;
    readonly numberOfChannels: number;
    readonly duration: number;
    private readonly samples: Float32Array;

    constructor(options?: { length: number; sampleRate: number; numberOfChannels: number }) {
        this.sampleRate = options?.sampleRate || decodedSampleRate;
        this.length = options?.length || decodedDurationSeconds * this.sampleRate;
        this.numberOfChannels = options?.numberOfChannels || 1;
        this.duration = this.length / this.sampleRate;
        this.samples = new Float32Array(this.length);
    }

    getChannelData() {
        return this.samples;
    }

    copyToChannel(source: Float32Array) {
        this.samples.set(source);
    }
}

beforeAll(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    });
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
    Object.defineProperty(globalThis, "AudioBuffer", { configurable: true, value: TestAudioBuffer });
    Object.defineProperty(globalThis, "AudioContext", {
        configurable: true,
        value: class {
            decodeAudioData = async () => new TestAudioBuffer();
            close = async () => undefined;
        },
    });
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
    });
});

afterEach(() => {
    cleanup();
    vad.create.mockClear();
    vad.messages = [];
    decodedDurationSeconds = 30;
    decodedSampleRate = 1000;
});

describe("shared audio node", () => {
    it("previews ready audio directly", () => {
        render(<AudioNodePlayer url="/audio.wav" title="台词音频" durationMs={2000} />);

        expect(screen.getByLabelText("预览 台词音频").getAttribute("src")).toBe("/audio.wav");
        expect(screen.getByText("2.0 秒").textContent).toBe("2.0 秒");
    });

    it("loads the waveform immediately and hides segmentation actions below 20 seconds", async () => {
        decodedDurationSeconds = 2;
        render(<AudioSegmentationPanel nodeId="audio-1" title="台词音频" url="/audio.wav" durationMs={2000} onSubmit={vi.fn()} />);

        expect(await screen.findByLabelText("音频波形分段编辑器")).toBeTruthy();
        expect(screen.queryByLabelText("预览 台词音频")).toBeNull();
        expect(screen.queryByRole("button", { name: "VAD 自动分割" })).toBeNull();
        expect(screen.queryByRole("button", { name: "重置" })).toBeNull();
        expect(screen.queryByRole("button", { name: "确认分段" })).toBeNull();
    });

    it("shows VAD automatic segmentation only when the decoded audio exceeds 20 seconds", async () => {
        decodedDurationSeconds = 20;
        const { rerender } = render(<AudioSegmentationPanel nodeId="audio-1" title="台词音频" url="/short.wav" durationMs={20000} onSubmit={vi.fn()} />);

        await screen.findByLabelText("音频波形分段编辑器");
        expect(screen.queryByRole("button", { name: "VAD 自动分割" })).toBeNull();

        decodedDurationSeconds = 30;
        rerender(<AudioSegmentationPanel nodeId="audio-1" title="台词音频" url="/long.wav" durationMs={30000} onSubmit={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "VAD 自动分割" })).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: "VAD 自动分割" }));
        await screen.findByText("当前共 2 个音频段");
        expect(vad.create).toHaveBeenCalledOnce();
    });

    it("uses VAD millisecond timestamps across the complete long audio", async () => {
        decodedDurationSeconds = 60;
        decodedSampleRate = 48000;
        vad.messages = [
            { audio: new Float32Array([1]), start: 1000, end: 16000 },
            { audio: new Float32Array([1]), start: 17000, end: 33000 },
            { audio: new Float32Array([1]), start: 34000, end: 59000 },
        ];
        render(<AudioSegmentationPanel nodeId="audio-1" title="台词音频" url="/long.wav" durationMs={60000} onSubmit={vi.fn()} />);

        fireEvent.click(await screen.findByRole("button", { name: "VAD 自动分割" }));

        expect(await screen.findByText("当前共 4 个音频段")).toBeTruthy();
    });

    it("uses manual waveform segmentation at every duration and submits physical WAV segments", async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(<AudioSegmentationPanel
            nodeId="audio-1"
            title="台词音频"
            url="/audio.wav"
            durationMs={30000}
            onSubmit={onSubmit}
            actions={<button type="button">链接首帧</button>}
        />);

        const waveform = await screen.findByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });
        fireEvent.click(waveform, { clientX: 150 });
        fireEvent.click(screen.getByRole("button", { name: "在光标处分割" }));
        await screen.findByText("当前共 2 个音频段");
        expect(screen.getByLabelText("第 1 段音频范围")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "新增片段" })).toBeNull();
        expect(screen.queryByRole("button", { name: "重置" })).toBeNull();
        expect(screen.getByLabelText("第 1 段音频范围").className).toContain("border-x-[3px]");
        expect(screen.getByRole("button", { name: "调整第 1 段开始时间" }).className).toContain("bg-transparent");
        expect(screen.getByLabelText("音频分段操作区").contains(screen.getByRole("button", { name: "确认分段" }))).toBe(true);
        expect(screen.getByLabelText("音频后续操作").contains(screen.getByRole("button", { name: "确认分段" }))).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "确认分段" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            parentNodeId: "audio-1",
            segmentationRunId: expect.any(String),
            segments: [
                expect.objectContaining({ index: 0, startMs: 0, endMs: 15000, blob: expect.any(Blob) }),
                expect.objectContaining({ index: 1, startMs: 15000, endMs: 30000, blob: expect.any(Blob) }),
            ],
        }));
    });

    it("only offers the merge button after multiple waveform segments are selected", () => {
        const onChange = vi.fn();
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }, { startMs: 20000, endMs: 28000 }]}
            onChange={onChange}
        />);

        fireEvent.pointerDown(screen.getByLabelText("第 1 段音频范围"));
        expect(screen.queryByRole("button", { name: "合并选中片段" })).toBeNull();
        fireEvent.pointerDown(screen.getByLabelText("第 2 段音频范围"), { metaKey: true });
        fireEvent.click(screen.getByRole("button", { name: "合并选中片段" }));

        expect(onChange).toHaveBeenCalledWith([
            { startMs: 0, endMs: 18000 },
            { startMs: 20000, endMs: 28000 },
        ]);
    });

    it("does not display ordinal labels inside or below waveform segments", () => {
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }]}
            onChange={vi.fn()}
        />);

        fireEvent.pointerDown(screen.getByLabelText("第 1 段音频范围"));

        expect(screen.queryByText("第 1 段")).toBeNull();
        expect(screen.getByText("0.00–8.00 秒")).toBeTruthy();
    });

    it("selects segments on pointer down and keeps pointer capture on the segment", () => {
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }]}
            onChange={vi.fn()}
        />);
        const first = screen.getByLabelText("第 1 段音频范围");
        const second = screen.getByLabelText("第 2 段音频范围");
        const captureFirst = vi.fn();
        const captureSecond = vi.fn();
        Object.assign(first, { setPointerCapture: captureFirst });
        Object.assign(second, { setPointerCapture: captureSecond });

        fireEvent.pointerDown(first, { pointerId: 1, clientX: 40 });
        fireEvent.pointerDown(second, { pointerId: 2, clientX: 140, ctrlKey: true });

        expect(captureFirst).toHaveBeenCalledWith(1);
        expect(captureSecond).toHaveBeenCalledWith(2);
        expect(screen.getByText("已选择 2 段")).toBeTruthy();
    });

    it("offers direct neighboring merge from a waveform segment context menu", async () => {
        const onChange = vi.fn();
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }]}
            onChange={onChange}
        />);

        fireEvent.contextMenu(screen.getByLabelText("第 1 段音频范围"));
        fireEvent.click(await screen.findByText("与下一段合并"));

        expect(onChange).toHaveBeenCalledWith([{ startMs: 0, endMs: 18000 }]);
    });

    it("moves the playhead on waveform click and toggles preview with Space", () => {
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            url="/audio.wav"
            segments={[]}
            onChange={vi.fn()}
        />);
        const waveform = screen.getByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });
        const preview = screen.getByLabelText("波形音频预览") as HTMLAudioElement;
        let paused = true;
        Object.defineProperty(preview, "paused", { configurable: true, get: () => paused });
        preview.play = vi.fn(async () => { paused = false; });
        preview.pause = vi.fn(() => { paused = true; });

        fireEvent.click(waveform, { clientX: 150 });
        expect(screen.getByLabelText("播放光标").getAttribute("style")).toContain("left: 50%");
        fireEvent.keyDown(waveform, { key: " ", code: "Space" });
        expect(preview.currentTime).toBe(15);
        expect(preview.play).toHaveBeenCalledOnce();
        fireEvent.keyDown(waveform, { key: " ", code: "Space" });
        expect(preview.pause).toHaveBeenCalledOnce();
    });

    it("splits the segment containing the playhead at the cursor position", () => {
        const onChange = vi.fn();
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            url="/audio.wav"
            segments={[{ startMs: 0, endMs: 20000 }]}
            onChange={onChange}
        />);
        const waveform = screen.getByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });

        fireEvent.click(waveform, { clientX: 100 });
        expect(screen.getByRole("button", { name: "在光标处分割" }).parentElement?.getAttribute("style")).toContain("left: 33.333");
        fireEvent.click(screen.getByRole("button", { name: "在光标处分割" }));

        expect(onChange).toHaveBeenCalledWith([
            { startMs: 0, endMs: 10000 },
            { startMs: 10000, endMs: 20000 },
        ]);
    });

    it("splits the uncovered range around the playhead into two segments", () => {
        const onChange = vi.fn();
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 22000, endMs: 30000 }]}
            onChange={onChange}
        />);
        const waveform = screen.getByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });

        fireEvent.click(waveform, { clientX: 150 });
        fireEvent.click(screen.getByRole("button", { name: "在光标处分割" }));

        expect(onChange).toHaveBeenCalledWith([
            { startMs: 0, endMs: 8000 },
            { startMs: 8000, endMs: 15000 },
            { startMs: 15000, endMs: 22000 },
            { startMs: 22000, endMs: 30000 },
        ]);
    });

    it("keeps a dragged segment inside neighboring boundaries without moving the playhead to release", () => {
        const onChange = vi.fn();
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={[{ startMs: 0, endMs: 8000 }, { startMs: 22000, endMs: 30000 }]}
            onChange={onChange}
        />);
        const waveform = screen.getByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });
        Object.assign(waveform, {
            setPointerCapture: vi.fn(),
            hasPointerCapture: vi.fn(() => false),
            releasePointerCapture: vi.fn(),
        });

        fireEvent.pointerDown(waveform, { pointerId: 1, clientX: 150 });
        fireEvent.pointerMove(waveform, { pointerId: 1, clientX: 260 });
        fireEvent.pointerUp(waveform, { pointerId: 1, clientX: 260 });
        fireEvent.click(waveform, { clientX: 260 });

        expect(onChange).toHaveBeenCalledWith([
            { startMs: 0, endMs: 8000 },
            { startMs: 15000, endMs: 22000 },
            { startMs: 22000, endMs: 30000 },
        ]);
        expect(screen.getByLabelText("播放光标").getAttribute("style")).toContain("left: 50%");
    });

    it("deletes all Control-selected segments with Backspace or the delete button", () => {
        const segments = [{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }, { startMs: 20000, endMs: 28000 }];
        const onChange = vi.fn();
        const { rerender } = render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            segments={segments}
            onChange={onChange}
        />);

        fireEvent.pointerDown(screen.getByLabelText("第 1 段音频范围"));
        fireEvent.pointerDown(screen.getByLabelText("第 3 段音频范围"), { ctrlKey: true });
        expect(screen.getByLabelText("第 1 段音频范围").className).toContain("ring-2");
        expect(screen.getByLabelText("第 3 段音频范围").className).toContain("ring-2");
        fireEvent.keyDown(screen.getByLabelText("音频波形"), { key: "Backspace" });
        expect(onChange).toHaveBeenLastCalledWith([{ startMs: 10000, endMs: 18000 }]);

        onChange.mockClear();
        rerender(<AudioWaveformEditor audio={new TestAudioBuffer() as unknown as AudioBuffer} segments={segments} onChange={onChange} />);
        fireEvent.pointerDown(screen.getByLabelText("第 1 段音频范围"));
        fireEvent.pointerDown(screen.getByLabelText("第 3 段音频范围"), { shiftKey: true });
        fireEvent.click(screen.getByRole("button", { name: "删除选中片段" }));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("stops Space preview at the end of the selected segment", () => {
        render(<AudioWaveformEditor
            audio={new TestAudioBuffer() as unknown as AudioBuffer}
            url="/audio.wav"
            segments={[{ startMs: 0, endMs: 8000 }]}
            onChange={vi.fn()}
        />);
        const waveform = screen.getByLabelText("音频波形");
        vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}) });
        const preview = screen.getByLabelText("波形音频预览") as HTMLAudioElement;
        let paused = true;
        Object.defineProperty(preview, "paused", { configurable: true, get: () => paused });
        preview.play = vi.fn(async () => { paused = false; });
        preview.pause = vi.fn(() => { paused = true; });

        fireEvent.pointerDown(screen.getByLabelText("第 1 段音频范围"), { clientX: 40 });
        fireEvent.keyDown(waveform, { key: " ", code: "Space" });
        preview.currentTime = 9;
        fireEvent.timeUpdate(preview);

        expect(preview.pause).toHaveBeenCalledOnce();
        expect(preview.currentTime).toBe(8);
        expect(screen.getByLabelText("播放光标").getAttribute("style")).toContain("26.666");
    });
});
