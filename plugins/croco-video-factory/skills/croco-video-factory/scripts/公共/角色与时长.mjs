import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export function characterVoiceId(characterJson) {
    return String(characterJson?.voice?.tts_voice_id || "").trim();
}

export async function resolveCharacterReference(characterDirectory) {
    const sheet = path.join(characterDirectory, "character-sheet");
    try {
        const images = (await readdir(sheet)).filter((name) => !name.startsWith(".") && /\.(png|jpe?g|webp)$/i.test(name)).sort();
        if (images[0]) return { path: path.join(sheet, images[0]), status: "character-sheet" };
    } catch {}
    const fallback = path.join(characterDirectory, "assets", "images", "full-body-image.png");
    try {
        await access(fallback);
        return { path: fallback, status: "full-body-fallback" };
    } catch {
        return { path: null, status: "missing" };
    }
}

export async function resolveSelectedCharacters({ pipelineRoot, names = [] }) {
    const index = JSON.parse(await readFile(path.join(pipelineRoot, "characters", "index.json"), "utf8"));
    const entries = Array.isArray(index.characters) ? index.characters : [];
    return Promise.all(names.map(async (name) => {
        const entry = entries.find((item) => [item.chinese_name, item.name, item.subtitle].includes(name));
        if (!entry) throw new Error(`正式角色不存在：${name}`);
        const directory = path.join(pipelineRoot, "characters", entry.directory);
        const character = JSON.parse(await readFile(path.join(directory, "character.json"), "utf8"));
        const reference = await resolveCharacterReference(directory);
        return { name: entry.chinese_name, directory, character, voiceId: characterVoiceId(character), referencePath: reference.path, referenceStatus: reference.status };
    }));
}

export function estimateSpeechDuration(text, options = {}) {
    const rate = Number(options.charactersPerSecond || 4.2);
    const count = [...String(text || "").replace(/\s/g, "")].length;
    return count / rate + Number(options.pauseSeconds || 0);
}

export function floorTimelineDuration(timelineEnd) {
    if (!Number.isFinite(Number(timelineEnd)) || Number(timelineEnd) < 0) throw new Error("时间线时长无效");
    return Math.floor(Number(timelineEnd));
}

export function normalizeShotDurations(shots) {
    const result = [];
    for (const raw of shots) {
        const shot = { ...raw, duration: floorTimelineDuration(raw.duration) };
        if (shot.duration > 15) {
            if (shot.splittable === false) throw new Error(`分镜 ${shot.id} 超过 15 秒且不可拆分`);
            const count = Math.ceil(shot.duration / 15);
            const base = Math.floor(shot.duration / count);
            for (let index = 0, used = 0; index < count; index += 1) {
                const duration = index === count - 1 ? shot.duration - used : base;
                result.push({ ...shot, id: `${shot.id}-${index + 1}`, duration, sourceIds: [shot.id] });
                used += duration;
            }
            continue;
        }
        if (shot.duration < 3 && result.length) {
            const previous = result.at(-1);
            if (previous.duration + shot.duration <= 15) {
                previous.duration += shot.duration;
                previous.id = `${previous.id}+${shot.id}`;
                previous.sourceIds = [...(previous.sourceIds || [previous.id]), shot.id];
                continue;
            }
        }
        result.push({ ...shot, sourceIds: shot.sourceIds || [shot.id] });
    }
    if (result[0]?.duration < 3 && result[1] && result[0].duration + result[1].duration <= 15) {
        const [first, second] = result.splice(0, 2);
        result.unshift({ ...second, id: `${first.id}+${second.id}`, duration: first.duration + second.duration, sourceIds: [...first.sourceIds, ...second.sourceIds] });
    }
    if (result.some((shot) => shot.duration < 3)) throw new Error("存在无法合并的 3 秒以下分镜");
    return result;
}
