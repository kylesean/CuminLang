import { describe, it, expect, vi } from 'vitest';

// 服务模块会经 simple-logger 依赖 electron（读取 userData 路径），
// vitest 下必须 mock，否则 require('electron') 只返回可执行文件路径字符串。
// userData 指向临时目录，保证日志等写入不落在真实应用目录。
vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-ai-sdk-test-userdata',
        getVersion: () => '6.1.0',
    },
    ipcMain: undefined,
    ipcRenderer: undefined,
    shell: { openPath: vi.fn() },
}));

// electron-store 是外部化 CJS 依赖，vitest 里 vi.mock('electron') 拦不到它内部的 require，
// 会导致它回落到 ~/Library/Preferences 等真实目录写入配置（曾把开发 Key 写出去）。
// 因此把应用 store 模块整体 mock 成内存实现，测试数据只存在于内存，绝不落盘。
// 与生产 storeGet 行为一致：未写入的键回落到 SettingKeyObj 里的默认值。
import { SettingKeyObj } from '@/common/types/store_schema';
import type { SettingKey } from '@/common/types/store_schema';
const storeState = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('@/backend/infrastructure/settings/store', () => ({
    storeGet: (key: string) => storeState.values.get(key) ?? SettingKeyObj[key as SettingKey] ?? '',
    storeSet: (key: string, value: string) => {
        storeState.values.set(key, value);
        return true;
    },
    subscribeSettingChange: () => () => undefined,
}));

import { streamText, type LanguageModel } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { loadAiSdkTestConfig } from '@/test/aiSdkTestConfig';
import { TranslateServiceImpl } from '../TranslateService';
import { BuiltinDictionaryStoreImpl } from '@/backend/infrastructure/translate/BuiltinDictionaryStoreImpl';
import { createBuiltinDictionaryFixture } from '@/test/builtinDictionaryFixture';
import { AiProviderServiceImpl } from '../AiProviderService';
import { ModelRoutingServiceImpl } from '../ModelRoutingService';
import type AiProviderService from '../AiProviderService';
import type SettingService from '../SettingService';
import type ImportedDictionaryService from '../ImportedDictionaryService';
import type EnglishDictionaryService from '../EnglishDictionaryService';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type WordTranslatesRepository from '@/backend/services/repositories/WordTranslatesRepository';

// 真实连接测试默认不跑（会发起计费请求）：需显式设置 DP_RUN_LIVE_AI_TESTS=true，
// 且开发环境配置文件（config.dev.json）里已配置 Key 时才执行。
const testConfig = loadAiSdkTestConfig();
const liveTestsEnabled = process.env.DP_RUN_LIVE_AI_TESTS === 'true' && Boolean(testConfig);

/**
 * 构造一个与生产 getModel 完全一致的直连测试模型：
 * @ai-sdk/openai-compatible 的 chat 模型（只走 /chat/completions，避开官方 provider 默认的
 * Responses API，uniapi 代理对 deepseek 的 Responses 流式实现不完整）。
 *
 * @param modelId 要使用的模型 id。
 * @returns 可直接传给 streamText 的 LanguageModel。
 */
const buildLiveModel = (modelId: string): LanguageModel => {
    const provider = createOpenAICompatible({
        name: 'openai',
        baseURL: testConfig!.endpoint,
        apiKey: testConfig!.key,
    });
    return provider.chatModel(modelId);
};

const seedLiveProviderStore = async (): Promise<void> => {
    const { storeSet } = await import('@/backend/infrastructure/settings/store');
    storeSet('models.openai.providers', JSON.stringify([testConfig!.provider]));
    storeSet('models.openai.activeProviderId', testConfig!.provider.id);
    storeSet('apiKeys.openAi.providerKeys', JSON.stringify({ [testConfig!.provider.id]: testConfig!.key }));
    if (testConfig!.sentenceLearningModel) {
        storeSet('models.openai.sentenceLearning', testConfig!.sentenceLearningModel);
    }
};

const runTests = (): void => {
    describe.skipIf(!liveTestsEnabled)('AI SDK 升级验证（ai v7 + @ai-sdk/openai-compatible）', () => {
        describe('AiProviderServiceImpl（应用真实取模型路径）', () => {
            it('真实连接：开发配置里的 Key 经 electron-store 取模型后能完成一次文本流', async () => {
                // Key/endpoint/模型路由字段与开发环境配置文件（config.dev.json）一致，写进隔离的测试 store 后走应用真实取模型路径。
                await seedLiveProviderStore();

                const routingService = new ModelRoutingServiceImpl();
                const providerService = new AiProviderServiceImpl(routingService);

                const model = providerService.getModel('sentenceLearning');
                expect(model).not.toBeNull();
                const result = streamText({
                    model: model!,
                    prompt: 'Reply with exactly: provider-ok',
                });
                let collected = '';
                for await (const chunk of result.textStream) {
                    collected += chunk;
                }
                expect(collected.trim().length).toBeGreaterThan(0);
            }, 60000);
        });


        describe('TranslateServiceImpl（词典路径）', () => {
            const rendererEvents: Array<{ path: string; params: Record<string, unknown> }> = [];

            const buildService = (overrides: {
                getModel?: (scene: string) => LanguageModel | null;
                findOne?: () => Promise<unknown>;
            } = {}): TranslateServiceImpl => {
                const aiProvider: AiProviderService = {
                    getModel: (scene) => (overrides.getModel
                        ? overrides.getModel(scene)
                        : buildLiveModel(testConfig!.model)),
                    createModelById: () => buildLiveModel(testConfig!.model),
                };
                const settingService: SettingService = {
                    getServiceCredentialsDetail: vi.fn(),
                    saveServiceCredentials: vi.fn(),
                    getRuntimeSettings: vi.fn(),
                    saveRuntimeSetting: vi.fn(),
                    getEngineSelectionDetail: vi.fn(),
                    saveEngineSelection: vi.fn(),
                    saveTranscriptionEngine: vi.fn(),
                    getShortcutSettingsDetail: vi.fn(),
                    saveShortcutSettings: vi.fn(),
                    getAppearanceSettingDetail: vi.fn(),
                    saveAppearanceSettings: vi.fn(),
                    getStorageSettingDetail: vi.fn(),
                    saveStorageSettings: vi.fn(),
                    getProxySettingDetail: vi.fn(),
                    saveProxySettings: vi.fn(),
                    getCurrentSentenceLearningProvider: vi.fn().mockResolvedValue('openai'),
                    getCurrentTranslationProvider: vi.fn().mockResolvedValue('openai'),
                    getCurrentDictionaryProvider: vi.fn().mockResolvedValue('openai'),
                    getSherpaTtsVoice: vi.fn().mockReturnValue('en-US-amy-low'),
                    saveSherpaTtsVoice: vi.fn().mockResolvedValue(undefined),
                    testOpenAi: vi.fn(),
                };
                const gateway: RendererGateway = {
                    call: vi.fn(async (_path: never, params: Record<string, unknown>) => {
                        rendererEvents.push({ path: _path as string, params });
                    }) as RendererGateway['call'],
                    fireAndForget: vi.fn(),
                };
                const wordRepo: WordTranslatesRepository = {
                    findOne: vi.fn().mockResolvedValue(overrides.findOne?.() ?? null),
                    upsert: vi.fn(),
                    deleteByProvider: vi.fn().mockResolvedValue(0),
                };
                const builtinFixture = createBuiltinDictionaryFixture([
                    { word: 'serendipity', phonetic: '', translation: 'n. 意外发现珍奇事物的运气' },
                ]);
                const importedDictionaryService = {
                    lookup: vi.fn().mockReturnValue(null),
                } as unknown as ImportedDictionaryService;
                const englishDictionaryService = {
                    lookup: vi.fn().mockReturnValue(null),
                } as unknown as EnglishDictionaryService;
                const service = new TranslateServiceImpl(
                    gateway,
                    aiProvider,
                    settingService,
                    wordRepo,
                    new BuiltinDictionaryStoreImpl(builtinFixture.dbPath),
                    importedDictionaryService,
                    englishDictionaryService,
                );
                return service;
            };

            it('真实连接：transWord() 通过结构化输出返回词典结果', async () => {
                const service = buildService();
                const result = await service.transWord('serendipity', true);
                expect(result).not.toBeNull();
                expect(result).toHaveProperty('definitions');
                const dictResult = result as Extract<NonNullable<typeof result>, { definitions: unknown[] }>;
                expect(dictResult.word.toLowerCase()).toBe('serendipity');
                expect(dictResult.definitions.length).toBeGreaterThan(0);
            }, 60000);
        });
    });
};

runTests();
