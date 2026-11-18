import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-sentence-learning-test-userdata',
        getVersion: () => '6.1.0',
    },
    ipcMain: undefined,
    ipcRenderer: undefined,
}));

import { SentenceLearningServiceImpl } from '@/backend/services/SentenceLearningService';
import type AiProviderService from '@/backend/services/AiProviderService';
import { CLOUD_AI_NOT_CONFIGURED_MESSAGE } from '@/common/constants/cloud-ai-errors';

const PARAMS = {
    text: 'I was just going to finish my thing.',
    precedingLines: ['and no one should be doing that.'],
    followingLines: ['You know, you could kind of make a joke about it.'],
};

describe('SentenceLearningServiceImpl 可用性与未配置提示', () => {
    it('已配置整句讲解模型时可用，未配置或开关关闭抛错时返回 false', async () => {
        const configured = new SentenceLearningServiceImpl({
            getModel: vi.fn(() => ({})),
        } as unknown as AiProviderService);
        await expect(configured.isLearningAvailable()).resolves.toBe(true);

        const unconfigured = new SentenceLearningServiceImpl({
            getModel: vi.fn(() => null),
        } as unknown as AiProviderService);
        await expect(unconfigured.isLearningAvailable()).resolves.toBe(false);

        const disabled = new SentenceLearningServiceImpl({
            getModel: vi.fn(() => {
                throw new Error('整句学习功能未启用');
            }),
        } as unknown as AiProviderService);
        await expect(disabled.isLearningAvailable()).resolves.toBe(false);
    });

    it('未配置可用 AI 模型时，completeSentence 显式抛出未配置引导而非静默回退', async () => {
        const service = new SentenceLearningServiceImpl({
            getModel: vi.fn(() => null),
        } as unknown as AiProviderService);

        await expect(service.completeSentence(PARAMS)).rejects.toThrow(CLOUD_AI_NOT_CONFIGURED_MESSAGE);
    });
});
