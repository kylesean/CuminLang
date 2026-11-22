import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storeGetMock } = vi.hoisted(() => ({
    storeGetMock: vi.fn(),
}));

vi.mock('@/backend/infrastructure/settings/store', () => ({
    storeGet: storeGetMock,
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SubtitleTranslationServiceImpl } from '../SubtitleTranslationService';
import type OpenAiSubtitleBatchTranslator from '@/backend/services/gateways/translate/OpenAiSubtitleBatchTranslator';

describe('SubtitleTranslationServiceImpl 局部补译与动态供应商名称', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeGetMock.mockImplementation((key: string) => {
            if (key === 'models.openai.providers') {
                return JSON.stringify([
                    {
                        id: 'custom-ollama',
                        name: 'Ollama 本地翻译',
                        apiFormat: 'openai',
                        endpoint: 'http://127.0.0.1:11434/v1',
                        models: ['qwen-translate'],
                        disabledModels: [],
                    },
                ]);
            }
            if (key === 'models.openai.subtitleTranslation') {
                return 'qwen-translate';
            }
            return '';
        });
    });

    const createService = (openAiTranslator: OpenAiSubtitleBatchTranslator) => {
        const rendererGateway = {
            call: vi.fn().mockResolvedValue(undefined),
            fireAndForget: vi.fn(),
        };
        const modelRoutingService = {
            resolveOpenAiModel: vi.fn().mockReturnValue({
                providerId: 'openai',
                modelId: 'qwen-translate',
                fullModelId: 'openai:qwen-translate',
            }),
            resolveProviderLabel: vi.fn().mockReturnValue('Ollama 本地翻译'),
        };
        const settingService = {
            getCurrentTranslationProvider: vi.fn().mockResolvedValue('openai'),
        };
        const sentenceTranslatesRepository = {
            findByStorageKeys: vi.fn().mockResolvedValue(new Map()),
            saveTranslations: vi.fn().mockResolvedValue(undefined),
        };

        const service = new SubtitleTranslationServiceImpl(
            settingService as never,
            { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as never,
            modelRoutingService as never,
            sentenceTranslatesRepository as never,
            rendererGateway as never,
            openAiTranslator,
        );

        return { service, rendererGateway, sentenceTranslatesRepository };
    };

    const makeTargets = () => [
        { key: 'k:0', text: 'Line zero' },
        { key: 'k:1', text: 'Line one' },
        { key: 'k:2', text: 'Line two' },
        { key: 'k:3', text: 'Line three' },
        { key: 'k:4', text: 'Line four' },
    ];

    it('5 条批量少返回 1 条（expected=5, actual=4）时保留已翻译 4 条并对缺失 1 条自动补译完成', async () => {
        const translateMock = vi.fn()
            .mockResolvedValueOnce([
                { key: 'k:0', translation: '第零句' },
                { key: 'k:1', translation: '第一句' },
                { key: 'k:2', translation: '第二句' },
                { key: 'k:4', translation: '第四句' },
            ])
            .mockResolvedValueOnce([
                { key: 'k:3', translation: '第三句' },
            ]);

        const { service } = createService({ translate: translateMock });
        const targets = makeTargets();

        const translations = await service.translateWithGateway(
            { targets, contextBefore: [], contextAfter: [], style: '自然简洁', signal: new AbortController().signal },
            targets,
        );

        expect(translateMock).toHaveBeenCalledTimes(2);
        expect(translateMock.mock.calls[1][0].targets).toEqual([{ key: 'k:3', text: 'Line three' }]);
        expect(translations.size).toBe(5);
        expect(translations.get('k:3')).toBe('第三句');
    });

    it('补译仍未能找回缺失条时，保留其余已译好的 4 条结果而不是整批丢弃', async () => {
        const translateMock = vi.fn()
            .mockResolvedValueOnce([
                { key: 'k:0', translation: '第零句' },
                { key: 'k:1', translation: '第一句' },
                { key: 'k:2', translation: '第二句' },
                { key: 'k:4', translation: '第四句' },
            ])
            .mockRejectedValueOnce(new Error('timeout'));

        const { service } = createService({ translate: translateMock });
        const targets = makeTargets();

        const translations = await service.translateWithGateway(
            { targets, contextBefore: [], contextAfter: [], style: '自然简洁', signal: new AbortController().signal },
            targets,
        );

        expect(translations.size).toBe(4);
        expect(translations.get('k:0')).toBe('第零句');
        expect(translations.has('k:3')).toBe(false);
    });

    it('错误提示里的引擎名称使用服务凭据配置的真实供应商名称，而非写死的 OpenAI', async () => {
        const translateMock = vi.fn().mockRejectedValue(new Error('connection refused'));
        const { service, rendererGateway } = createService({ translate: translateMock });

        await (service as unknown as { executeBatch: (req: unknown) => Promise<unknown> }).executeBatch({
            fileHash: 'hash-1',
            batchId: 'batch-1',
            demandId: 1,
            priority: 'high',
            requeueCount: 1,
            indices: [0],
            context: {
                provider: 'openai',
                storageMode: 'openai#v1',
                style: '自然',
                styleSignature: 'sig',
                profileKey: 'pk',
                localModelId: null,
                sentencesByIndex: new Map([
                    [0, { key: 'k:0', translationKey: 'k:0', index: 0, text: 'Hello', textZH: '', startTime: 0, endTime: 1, fileHash: 'hash-1' } as never],
                ]),
            },
            signal: new AbortController().signal,
        });

        expect(rendererGateway.fireAndForget).toHaveBeenCalledWith(
            'ui/show-toast',
            expect.objectContaining({
                message: expect.stringContaining('Ollama 本地翻译字幕翻译请求失败'),
            }),
        );
    });
});
