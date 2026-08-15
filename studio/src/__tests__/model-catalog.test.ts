import { describe, expect, it } from 'vitest';

import {
    DEFAULT_MODEL_SETTINGS,
    GLOBAL_I2I_MODELS,
    GLOBAL_I2V_MODELS,
    GLOBAL_IMAGE_MODELS,
    GLOBAL_T2I_MODELS,
    R2V_ROUTE_MODEL_ID,
    R2V_SELECTION_MODEL_ID,
    getCanonicalDefaults,
    getCanonicalModeEntry,
    getCanonicalModeId,
    getLegacyModelId,
    getMaxReferenceImages,
    getModelLineEntry,
    getModeGateway,
    resolveModelSettings,
} from '@/lib/modelCatalog';

describe('Croco model catalog selectors', () => {
    it('uses only Canvas-supported image and video defaults', () => {
        expect(DEFAULT_MODEL_SETTINGS).toMatchObject({
            t2i_model: 'google:nano-banana@2-lite',
            i2i_model: 'google:nano-banana@2-lite',
            image_model: 'google:nano-banana@2-lite',
            i2v_model: 'minimax-h3',
            r2v_model: 'minimax-h3-r2v',
        });

        const imageIds = [
            'google:nano-banana@2-lite',
            'google:4@1',
            'openai:gpt-image@2',
        ];
        expect(GLOBAL_IMAGE_MODELS.map((model) => model.id)).toEqual(imageIds);
        expect(GLOBAL_T2I_MODELS.map((model) => model.id)).toEqual(imageIds);
        expect(GLOBAL_I2I_MODELS.map((model) => model.id)).toEqual(imageIds);
        expect(GLOBAL_I2V_MODELS.map((model) => model.id)).toEqual(['minimax-h3']);
    });

    it('does not expose upstream LumenX provider models', () => {
        const visibleIds = [
            ...GLOBAL_IMAGE_MODELS,
            ...GLOBAL_I2V_MODELS,
        ].map((model) => model.id);
        expect(visibleIds.some((id) => /wan|kling|vidu|happyhorse|seedance|pixverse/i.test(id))).toBe(false);
    });
});

describe('Croco model catalog fallbacks', () => {
    it('falls unknown models back to executable Canvas defaults', () => {
        expect(resolveModelSettings({
            t2i_model: 'missing-model',
            i2i_model: 'wan2.6-image',
            i2v_model: 'kling-v3-i2v',
            r2v_model: 'happyhorse-1.1-r2v',
        }, 'global_settings')).toMatchObject({
            t2i_model: 'google:nano-banana@2-lite',
            i2i_model: 'google:nano-banana@2-lite',
            i2v_model: 'minimax-h3',
            r2v_model: 'minimax-h3-r2v',
        });
    });

    it('reads reference-image limits from the selected Croco image model', () => {
        expect(getMaxReferenceImages('google:nano-banana@2-lite')).toBe(9);
        expect(getMaxReferenceImages('google:4@1')).toBe(9);
    });
});

describe('Croco canonical routing metadata', () => {
    it('routes H3 reference mode through the H3 Canvas runtime', () => {
        expect(R2V_SELECTION_MODEL_ID).toBe('minimax-h3-r2v');
        expect(R2V_ROUTE_MODEL_ID).toBe('minimax-h3-r2v');

        const entry = getCanonicalModeEntry('minimax/minimax-h3#r2v');
        expect(entry).toMatchObject({
            model_line_id: 'minimax-h3',
            legacy_model_id: 'minimax-h3-r2v',
            mode: 'r2v',
            family: 'minimax',
        });
        expect(getModeGateway('minimax/minimax-h3#r2v', 'croco')).toBe('minimax-h3');
    });

    it('keeps the Croco model-line metadata addressable', () => {
        expect(getModelLineEntry('minimax-h3')).toMatchObject({
            family: 'minimax',
            modes: ['t2v', 'i2v', 'fl2v', 'r2v'],
            legacy_model_ids: ['minimax-h3', 'minimax-h3-r2v'],
        });
        expect(getCanonicalModeId('minimax-h3')).toBeUndefined();
        expect(getLegacyModelId('minimax/minimax-h3#i2v')).toBeUndefined();
    });

    it('reports the executable defaults without inventing legacy aliases', () => {
        expect(getCanonicalDefaults()).toEqual({
            t2i_model: 'google:nano-banana@2-lite',
            i2i_model: 'google:nano-banana@2-lite',
            image_model: 'google:nano-banana@2-lite',
            i2v_model: 'minimax-h3',
            r2v_model: 'minimax-h3-r2v',
        });
    });
});
