import { describe, expect, it } from 'vitest';

import { GRID_COLS_CLASS, I2V_MODELS } from '@/store/projectStore';

describe('Croco GPU video parameters', () => {
    it('exposes both executable Chengdu video models', () => {
        expect(I2V_MODELS.map((model) => model.id)).toEqual(['minimax-h3', 'ltx-2.5']);
    });

    it('keeps the duration and output controls supported by the Canvas runtime', () => {
        const h3 = I2V_MODELS[0];
        expect(h3.duration).toEqual({ type: 'slider', min: 3, max: 15, step: 1, default: 6 });
        expect(h3.params.resolution).toEqual({
            options: ['preview', '720p', '1080p'],
            default: 'preview',
        });
        expect(h3.params.ratio).toEqual({
            options: ['16:9', '9:16', '1:1'],
            default: '16:9',
        });
    });

    it('does not surface parameters belonging to removed LumenX providers', () => {
        const params = I2V_MODELS[0].params;
        expect(params.mode).toBeUndefined();
        expect(params.sound).toBeUndefined();
        expect(params.cfgScale).toBeUndefined();
        expect(params.viduAudio).toBeUndefined();
        expect(params.movementAmplitude).toBeUndefined();
    });
});

describe('video parameter layout helpers', () => {
    it('covers every option count used by an executable model', () => {
        const usedCounts = new Set<number>();
        for (const model of I2V_MODELS) {
            if (model.params.resolution) usedCounts.add(model.params.resolution.options.length);
            if (model.params.ratio) usedCounts.add(model.params.ratio.options.length);
            if (model.duration.type === 'buttons') usedCounts.add(model.duration.options.length);
        }
        usedCounts.forEach((count) => expect(GRID_COLS_CLASS[count]).toBeDefined());
    });
});
