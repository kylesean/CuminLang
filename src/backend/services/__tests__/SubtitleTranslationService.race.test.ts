import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SubtitleTranslationServiceImpl } from '@/backend/services/subtitle-translation/SubtitleTranslationService';
import type SettingService from '@/backend/services/SettingService';
import type CacheService from '@/backend/services/CacheService';
import type ModelRoutingService from '@/backend/services/ModelRoutingService';
import type SentenceTranslatesRepository from '@/backend/services/repositories/SentenceTranslatesRepository';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type OpenAiSubtitleBatchTranslator from '@/backend/services/gateways/translate/OpenAiSubtitleBatchTranslator';

function createHarness(getCurrentTranslationProvider: SettingService['getCurrentTranslationProvider']) {
    const translate = vi.fn().mockResolvedValue([{ key: 'hash-1:0', translation: '你好' }]);
    const findBySentencesAndMode = vi.fn().mockResolvedValue([]);
    const upsertMany = vi.fn().mockResolvedValue(undefined);
    const fireAndForget = vi.fn();

    const service = new SubtitleTranslationServiceImpl(
        { getCurrentTranslationProvider } as unknown as SettingService,
        {
            get: vi.fn().mockReturnValue({
                sentences: [{
                    index: 0,
                    text: 'hello',
                    translationKey: 'hash-1:0',
                    start: 0,
                    end: 1,
                }],
            }),
        } as unknown as CacheService,
        {
            resolveOpenAiModel: vi.fn().mockReturnValue({
                providerId: 'openai',
                modelId: 'gpt-4o-mini',
                fullModelId: 'openai:gpt-4o-mini',
            }),
            resolveProviderLabel: vi.fn().mockReturnValue('OpenAI'),
        } as unknown as ModelRoutingService,
        { findBySentencesAndMode, upsertMany } as unknown as SentenceTranslatesRepository,
        { fireAndForget } as unknown as RendererGateway,
        { translate } as unknown as OpenAiSubtitleBatchTranslator,
    );

    return { service, translate, findBySentencesAndMode, upsertMany, fireAndForget };
}

describe('SubtitleTranslationService updateDemand 与 releaseSession 竞态', () => {
    it('会话保持活跃时，updateDemand 会调度执行翻译并向渲染进程推送结果', async () => {
        const harness = createHarness(vi.fn().mockResolvedValue('openai'));

        await harness.service.updateDemand({
            fileHash: 'hash-1',
            currentIndex: 0,
            demandId: 1,
            rendererSessionId: 'renderer-a',
        });

        await vi.waitFor(() => {
            expect(harness.fireAndForget).toHaveBeenCalledWith(
                'translation/batch-result',
                expect.objectContaining({
                    translations: [
                        expect.objectContaining({ fileHash: 'hash-1', key: 'hash-1:0', translation: '你好' }),
                    ],
                }),
            );
        });
        expect(harness.translate).toHaveBeenCalledWith(expect.objectContaining({
            targets: [{ key: 'hash-1:0', text: 'hello' }],
        }));
    });

    it('updateDemand 等待配置解析期间若会话已 releaseSession，不应复活已关闭会话或触发翻译请求', async () => {
        let resolveProvider!: (v: 'openai') => void;
        const harness = createHarness(
            vi.fn().mockImplementation(
                () => new Promise<'openai'>((resolve) => {
                    resolveProvider = resolve;
                }),
            ),
        );

        const pendingDemand = harness.service.updateDemand({
            fileHash: 'hash-1',
            currentIndex: 0,
            demandId: 1,
            rendererSessionId: 'renderer-a',
        });

        // 在异步解析尚未完成前释放会话
        harness.service.releaseSession('hash-1', 'renderer-a');
        resolveProvider('openai');
        await pendingDemand;

        // 调度器若被误触发，微任务队列中会发起仓储查重和翻译请求；放行微任务后验证仍完全静默
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.findBySentencesAndMode).not.toHaveBeenCalled();
        expect(harness.translate).not.toHaveBeenCalled();
        expect(harness.fireAndForget).not.toHaveBeenCalled();
    });
});
