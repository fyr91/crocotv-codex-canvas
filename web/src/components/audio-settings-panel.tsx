import { type ReactNode } from "react";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptions, audioInstructionPresets, audioSpeedLabel, audioVoiceOptions, normalizeAudioFormatValue, normalizeAudioPitchValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue, normalizeAudioVolumeValue, type SpeechVoiceOption } from "@/lib/audio-generation";
import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const speedOptions = ["0.75", "1", "1.25", "1.5"];
const volumeOptions = ["0.5", "1", "1.5", "2"];
const pitchOptions = ["-6", "-2", "0", "2", "6"];

type AudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioVolume" | "audioPitch" | "audioInstructions";

type AudioSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: AudioSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    voiceOptions?: SpeechVoiceOption[];
    voiceStatus?: string;
};

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", voiceOptions = audioVoiceOptions, voiceStatus }: AudioSettingsPanelProps) {
    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">音频设置</div> : null}
                <SettingGroup title="声音" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {voiceOptions.map((item) => (
                            <OptionPill key={item.value || "current"} selected={voice === item.value} disabled={item.disabled} theme={theme} onClick={() => onConfigChange("audioVoice", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                    {voiceStatus ? <div className="text-[11px]" style={{ color: theme.node.muted }}>{voiceStatus}</div> : null}
                </SettingGroup>
                <SettingGroup title="格式" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {audioFormatOptions.map((item) => (
                            <OptionPill key={item.value} selected={format === item.value} theme={theme} onClick={() => onConfigChange("audioFormat", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="语速" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {speedOptions.map((value) => (
                            <OptionPill key={value} selected={speed === value} theme={theme} onClick={() => onConfigChange("audioSpeed", value)}>
                                {audioSpeedLabel(value)}
                            </OptionPill>
                        ))}
                    </div>
                    <input
                        type="number"
                        min={0.5}
                        max={1.5}
                        step={0.05}
                        className="h-9 w-full rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                        value={config.audioSpeed || "1"}
                        onChange={(event) => onConfigChange("audioSpeed", event.target.value)}
                        onBlur={(event) => onConfigChange("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
                <NumberSetting title="音量" values={volumeOptions} value={normalizeAudioVolumeValue(config.audioVolume)} min={0.5} max={2} step={0.05} theme={theme} onChange={(value) => onConfigChange("audioVolume", value)} normalize={normalizeAudioVolumeValue} />
                <NumberSetting title="音高" values={pitchOptions} value={normalizeAudioPitchValue(config.audioPitch)} min={-6} max={6} step={1} theme={theme} onChange={(value) => onConfigChange("audioPitch", value)} normalize={normalizeAudioPitchValue} />
                <SettingGroup title="声音指令" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {audioInstructionPresets.map((item) => <OptionPill key={item.label} selected={config.audioInstructions === item.value} theme={theme} onClick={() => onConfigChange("audioInstructions", item.value)}>{item.label}</OptionPill>)}
                    </div>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder="例如：自然、温暖、适合旁白。"
                        className="thin-scrollbar h-20 w-full resize-none overflow-y-auto overscroll-contain rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onConfigChange("audioInstructions", event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function NumberSetting({ title, values, value, min, max, step, theme, onChange, normalize }: { title: string; values: string[]; value: string; min: number; max: number; step: number; theme: CanvasTheme; onChange: (value: string) => void; normalize: (value: string) => string }) {
    return <SettingGroup title={title} color={theme.node.muted}><div className="flex gap-2.5">{values.map((item) => <OptionPill key={item} selected={value === item} theme={theme} onClick={() => onChange(item)}>{item}</OptionPill>)}</div><input type="number" min={min} max={max} step={step} className="h-9 w-full rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }} value={value} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onChange(normalize(event.target.value))} onMouseDown={(event) => event.stopPropagation()} /></SettingGroup>;
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 min-w-0 flex-1 cursor-pointer truncate rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}
