import { useEffect, useState } from "react";

const BAR_COUNT = 40;
const IDLE_LEVEL = 0.04;
const INPUT_GAIN = 8;
const idleLevels = Array.from({ length: BAR_COUNT }, () => IDLE_LEVEL);

export function LiveRecordingWaveform({ stream }: { stream: MediaStream | null }) {
    const [levels, setLevels] = useState(idleLevels);

    useEffect(() => {
        if (!stream) {
            setLevels(idleLevels);
            return;
        }
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let frame = 0;
        let disposed = false;
        const draw = () => {
            analyser.getByteTimeDomainData(samples);
            let energy = 0;
            for (const sample of samples) {
                const amplitude = (sample - 128) / 128;
                energy += amplitude * amplitude;
            }
            const level = Math.max(IDLE_LEVEL, Math.min(1, Math.sqrt(energy / samples.length) * INPUT_GAIN));
            setLevels((current) => [...current.slice(1), level]);
            frame = requestAnimationFrame(draw);
        };
        void (async () => {
            if (context.state === "suspended") await context.resume().catch(() => undefined);
            if (!disposed) frame = requestAnimationFrame(draw);
        })();
        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            source.disconnect();
            analyser.disconnect();
            void context.close();
        };
    }, [stream]);

    return (
        <div role="img" aria-label="实时录音波形" className="flex h-24 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-4">
            {levels.map((level, index) => (
                <span
                    key={index}
                    data-testid="recording-waveform-bar"
                    className="min-w-0 flex-1 rounded-full bg-foreground/60 transition-[height] duration-75"
                    style={{ height: `${Math.max(4, Math.round(level * 92))}%` }}
                />
            ))}
        </div>
    );
}
