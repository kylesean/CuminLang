import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-setting-credentials-test',
        getVersion: () => '6.1.0',
    },
    ipcMain: undefined,
    ipcRenderer: undefined,
}));

import { SettingServiceImpl } from '@/backend/services/SettingService';
import type { SettingsStore } from '@/backend/services/gateways/SettingsStore';
import { SettingKeyObj, type SettingKey } from '@/common/types/store_schema';

/** 测试用假凭据；形态像真实密钥，但都是编出来的。 */
const OPENAI_KEY = 'sk-test-aaaaaaaaaaaaaaaa1234';
const TENCENT_ID = 'AKIDtesttencentsecretid01';
const TENCENT_KEY = 'tencentsecretkey0000wxyz';

/**
 * 内存版设置存储：只实现凭据链路实际用到的 get/set。
 */
const createStore = (initial: Partial<Record<SettingKey, string>> = {}) => {
    // 未显式覆盖的键取 schema 默认值：真实 store 也是这么读的，
    // 否则 apiFormat 之类的枚举字段会是空串而被判非法。
    const values = new Map<string, string>(Object.entries(SettingKeyObj) as Array<[string, string]>);
    for (const [key, value] of Object.entries(initial)) {
        values.set(key, value as string);
    }
    const store = {
        get: vi.fn((key: SettingKey) => values.get(key) ?? ''),
        set: vi.fn((key: SettingKey, value: string) => {
            values.set(key, value);
            return true;
        }),
        has: vi.fn((key: SettingKey) => values.has(key)),
        values,
    };
    return store;
};

const createService = (store: ReturnType<typeof createStore>): SettingServiceImpl => {
    return new SettingServiceImpl(
        { storeUpdate: vi.fn(), error: vi.fn(), info: vi.fn() } as never,
        { createModelById: vi.fn() } as never,
        { get: vi.fn() } as never,
        store as unknown as SettingsStore,
        { getDirectory: vi.fn() } as never,
    );
};

const baseSave = {
    openai: {
        endpoint: 'https://api.example.com/v1',
        apiFormat: 'openai' as const,
        models: ['gpt-4o-mini'],
    },
    tencent: {},
};

describe('服务凭据：不把明文送进渲染进程', () => {
    let store: ReturnType<typeof createStore>;
    let service: SettingServiceImpl;

    beforeEach(() => {
        store = createStore({
            'apiKeys.openAi.key': OPENAI_KEY,
            'apiKeys.openAi.endpoint': 'https://api.example.com/v1',
            'apiKeys.openAi.apiFormat': 'openai',
            'models.openai.available': 'gpt-4o-mini',
            'apiKeys.tencent.secretId': TENCENT_ID,
            'apiKeys.tencent.secretKey': TENCENT_KEY,
        });
        service = createService(store);
    });

    it('详情只给末四位提示，不含密钥本体', async () => {
        const detail = await service.getServiceCredentialsDetail();

        expect(detail.openai.hasKey).toBe(true);
        expect(detail.openai.keyHint).toBe('••••1234');
        const serialized = JSON.stringify(detail);
        expect(serialized).not.toContain(OPENAI_KEY);
        expect(serialized).not.toContain(TENCENT_ID);
        expect(serialized).not.toContain(TENCENT_KEY);
        expect(detail.tencent.hasCredentials).toBe(true);
        expect(detail.tencent.secretIdHint).toBe(`••••${TENCENT_ID.slice(-4)}`);
    });

    it('未配置时 hasKey 为 false 且提示为空', async () => {
        const empty = createService(createStore());
        const detail = await empty.getServiceCredentialsDetail();

        expect(detail.openai.hasKey).toBe(false);
        expect(detail.openai.keyHint).toBe('');
        expect(detail.tencent.hasCredentials).toBe(false);
    });

    /**
     * 设置页是自动保存的：用户只改接口地址时，密钥框是空的。
     * 空值必须理解成「沿用」，否则一次无关的编辑就把凭据抹掉了。
     */
    it('密钥留空时保留已保存的值', async () => {
        await service.saveServiceCredentials({ ...baseSave, openai: { ...baseSave.openai, key: '' } });

        expect(store.values.get('apiKeys.openAi.key')).toBe(OPENAI_KEY);
        expect(store.values.get('apiKeys.tencent.secretKey')).toBe(TENCENT_KEY);
    });

    it('填了新密钥才覆盖', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: { ...baseSave.openai, key: 'sk-test-newkey-0000000000009999' },
        });

        expect(store.values.get('apiKeys.openAi.key')).toBe('sk-test-newkey-0000000000009999');
    });

    it('显式 clearKey 才清空', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: { ...baseSave.openai, clearKey: true },
        });

        expect(store.values.get('apiKeys.openAi.key')).toBe('');
    });

    it('支持保存和回读云端向量模型及本地整句讲解路由', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: { ...baseSave.openai, embeddingModel: '  text-embedding-3-small  ' },
        });
        const creds = await service.getServiceCredentialsDetail();
        expect(creds.openai.embeddingModel).toBe('text-embedding-3-small');

        await service.saveEngineSelection({
            openai: {
                enableSentenceLearning: true,
                subtitleTranslationMode: 'zh',
                subtitleCustomStyle: '',
                featureModels: {
                    sentenceLearning: 'gpt-4o-mini',
                    subtitleTranslation: 'gpt-4o-mini',
                    dictionary: 'gpt-4o-mini',
                },
            },
            providers: {
                subtitleTranslationEngine: 'openai',
                dictionaryEngine: 'none',
                embeddingEngine: 'openai',
            },
            invalidValues: {},
        });

        const selection = await service.getEngineSelectionDetail();
        expect(selection.providers.subtitleTranslationEngine).toBe('openai');
        expect(selection.providers.dictionaryEngine).toBe('none');
        expect(selection.providers.embeddingEngine).toBe('openai');
        expect(selection.openai.featureModels.sentenceLearning).toBe('gpt-4o-mini');
    });

    it('providerKeys 读取为空（含密文暂时无法解密场景）且未显式改动密钥时，写入空串而非 "{}" 以免覆盖磁盘密文', async () => {
        const emptyKeysStore = createStore({
            'apiKeys.openAi.key': '',
            'apiKeys.openAi.providerKeys': '',
        });
        const svc = createService(emptyKeysStore);

        await svc.saveServiceCredentials({
            openai: {
                endpoint: 'https://api.example.com/v1',
                apiFormat: 'openai',
                models: ['gpt-4o-mini'],
                activeProviderId: 'openai',
                providers: [{
                    id: 'openai',
                    name: 'OpenAI',
                    apiFormat: 'openai',
                    endpoint: 'https://api.example.com/v1',
                    models: ['gpt-4o-mini'],
                }],
            },
            tencent: {},
        });

        expect(emptyKeysStore.values.get('apiKeys.openAi.providerKeys')).toBe('');
    });
});

describe('代理设置校验与落盘', () => {
    it.each([
        '127.0.0.1:7890',
        'http://',
        'socks5://127.0.0.1',
        'socks5://:1080',
        'ftp://127.0.0.1:21',
    ])('custom 模式下拒绝非法代理地址 %s 且不覆盖旧配置', async (badUrl) => {
        const store = createStore({
            'proxy.mode': 'custom',
            'proxy.url': 'http://127.0.0.1:7890',
            'proxy.bypass_rules': 'localhost',
        });
        const service = createService(store);

        await expect(
            service.saveProxySettings({ mode: 'custom', url: badUrl, bypassRules: '127.0.0.1' }),
        ).rejects.toThrow();

        expect(store.values.get('proxy.mode')).toBe('custom');
        expect(store.values.get('proxy.url')).toBe('http://127.0.0.1:7890');
        expect(store.values.get('proxy.bypass_rules')).toBe('localhost');
    });

    it('合法 custom 地址会去掉首尾空白后保存，非 custom 模式不拦截旧 URL', async () => {
        const store = createStore();
        const service = createService(store);

        await service.saveProxySettings({
            mode: 'custom',
            url: '  socks5://127.0.0.1:1080  ',
            bypassRules: 'localhost',
        });
        expect(store.values.get('proxy.mode')).toBe('custom');
        expect(store.values.get('proxy.url')).toBe('socks5://127.0.0.1:1080');

        await service.saveProxySettings({
            mode: 'none',
            url: '127.0.0.1:7890',
            bypassRules: '',
        });
        expect(store.values.get('proxy.mode')).toBe('none');
    });
});
