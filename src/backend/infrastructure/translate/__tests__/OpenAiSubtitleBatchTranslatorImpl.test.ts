import { NoObjectGeneratedError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({
    generateTextMock: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>();
    return {
        ...actual,
        generateText: generateTextMock,
    };
});

import OpenAiSubtitleBatchTranslatorImpl from '../OpenAiSubtitleBatchTranslatorImpl';
import type AiProviderService from '@/backend/services/AiProviderService';
import type { SubtitleBatchTranslationInput } from '@/backend/services/gateways/translate/SubtitleBatchTranslationInput';

const makeInput = (): SubtitleBatchTranslationInput => ({
    targets: [
        { key: 'hash:115', text: 'Because intelligence is the foundation.' },
        { key: 'hash:116', text: 'AI brings uncertainty to many people.' },
    ],
    contextBefore: [],
    contextAfter: [],
    mode: 'zh',
    style: '自然简洁中文字幕',
    signal: new AbortController().signal,
});

const makeNoObjectError = (id: string, text: string) => new NoObjectGeneratedError({
    message: 'No object generated: could not parse the response.',
    text,
    response: { id, timestamp: new Date(), modelId: 'local-translate' },
    usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: undefined,
        },
    },
    finishReason: 'stop',
});

describe('OpenAiSubtitleBatchTranslatorImpl 代码块 JSON 容错解析', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('模型在 JSON 外包裹 ```json ... ``` 代码块导致 AI SDK 抛出 NoObjectGeneratedError 时，剥离代码块并成功解析', async () => {
        const fencedPayload = [
            '```json',
            JSON.stringify({
                items: [
                    { key: 'hash:115', translation: '因为智能是一切行业的基础。' },
                    { key: 'hash:116', translation: 'AI 给许多人带来了不确定性。' },
                ],
            }, null, 2),
            '```',
        ].join('\n');

        generateTextMock.mockRejectedValueOnce(makeNoObjectError('resp-1', fencedPayload));

        const aiProvider = {
            getModel: vi.fn().mockReturnValue({ provider: 'openai', modelId: 'local-translate' }),
            createModelById: vi.fn(),
        } as unknown as AiProviderService;

        const translator = new OpenAiSubtitleBatchTranslatorImpl(aiProvider);
        const result = await translator.translate(makeInput());

        expect(result).toEqual([
            { key: 'hash:115', translation: '因为智能是一切行业的基础。' },
            { key: 'hash:116', translation: 'AI 给许多人带来了不确定性。' },
        ]);
    });

    it('返回内容彻底无法解析为目标结构时保留原 NoObjectGeneratedError 抛出', async () => {
        generateTextMock.mockRejectedValueOnce(makeNoObjectError('resp-2', '这是一段纯文本没有JSON结构'));

        const aiProvider = {
            getModel: vi.fn().mockReturnValue({ provider: 'openai', modelId: 'local-translate' }),
            createModelById: vi.fn(),
        } as unknown as AiProviderService;

        const translator = new OpenAiSubtitleBatchTranslatorImpl(aiProvider);
        await expect(translator.translate(makeInput())).rejects.toThrow(NoObjectGeneratedError);
    });
});
