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

const loggerInfo = vi.hoisted(() => vi.fn());
vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({
        info: loggerInfo,
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import { SettingServiceImpl } from '@/backend/services/SettingService';
import type { SettingsStore } from '@/backend/services/gateways/SettingsStore';
import { SettingKeyObj, type SettingKey } from '@/common/types/store_schema';

/** 测试用假凭据；形态像真实密钥，但都是编出来的。 */
const OPENAI_KEY = 'sk-test-aaaaaaaaaaaaaaaa1234';

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
        store as unknown as SettingsStore,
        { getDirectory: vi.fn() } as never,
    );
};

const DEFAULT_PROVIDERS = JSON.stringify([
    {
        id: 'deepseek',
        name: 'DeepSeek',
        apiFormat: 'openai',
        endpoint: 'https://api.example.com/v1',
        models: ['gpt-4o-mini'],
        disabledModels: [],
    },
]);

const baseSave = {
    openai: {
        activeProviderId: 'deepseek',
        providers: [
            {
                id: 'deepseek',
                name: 'DeepSeek',
                endpoint: 'https://api.example.com/v1',
                apiFormat: 'openai' as const,
                models: ['gpt-4o-mini'],
                disabledModels: [],
            },
        ],
    },
};

describe('服务凭据：不把明文送进渲染进程', () => {
    let store: ReturnType<typeof createStore>;
    let service: SettingServiceImpl;

    beforeEach(() => {
        store = createStore({
            'apiKeys.openAi.providerKeys': JSON.stringify({ deepseek: OPENAI_KEY }),
            'models.openai.activeProviderId': 'deepseek',
            'models.openai.providers': DEFAULT_PROVIDERS,
        });
        service = createService(store);
    });

    it('详情只给末四位提示，不含密钥本体', async () => {
        const detail = await service.getServiceCredentialsDetail();

        expect(detail.openai.providers[0]?.hasKey).toBe(true);
        expect(detail.openai.providers[0]?.keyHint).toBe('••••1234');
        const serialized = JSON.stringify(detail);
        expect(serialized).not.toContain(OPENAI_KEY);
    });

    it('未配置时 hasKey 为 false 且提示为空，并返回默认服务商档案', async () => {
        const empty = createService(createStore());
        const detail = await empty.getServiceCredentialsDetail();

        expect(detail.openai.providers).toHaveLength(1);
        expect(detail.openai.providers[0]?.hasKey).toBe(false);
        expect(detail.openai.providers[0]?.keyHint).toBe('');
    });

    /**
     * 设置页是自动保存的：用户只改接口地址时，密钥框是空的。
     * 空值必须理解成「沿用」，否则一次无关的编辑就把凭据抹掉了。
     */
    it('密钥留空时保留已保存的值', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{ ...baseSave.openai.providers[0], key: '' }],
            },
        });

        expect(JSON.parse(store.values.get('apiKeys.openAi.providerKeys')!)).toEqual({ deepseek: OPENAI_KEY });
    });

    /**
     * 换地址是正常操作（官方 ↔ 自建代理 ↔ 中转站），密钥仍按服务商条目归属；
     * 但「这把密钥以后会发到哪个域名」必须能在日志里回溯。
     */
    it('接口主机变更时记录 from/to 与密钥是否沿用，且不落完整 URL', async () => {
        loggerInfo.mockClear();

        await service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{
                    ...baseSave.openai.providers[0],
                    endpoint: 'https://proxy.example.net/v1',
                    key: '',
                }],
            },
        });

        const changeLog = loggerInfo.mock.calls.find(([message]) => message === 'provider endpoint host changed');
        expect(changeLog).toBeDefined();
        expect(changeLog?.[1]).toEqual({
            providerId: 'deepseek',
            from: 'api.example.com',
            to: 'proxy.example.net',
            keyReused: true,
        });
        expect(JSON.stringify(changeLog)).not.toContain(OPENAI_KEY);
        expect(JSON.stringify(changeLog)).not.toContain('/v1');
    });

    it('主机未变更时不写变更日志', async () => {
        loggerInfo.mockClear();

        await service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                // 同主机换路径（/v1 -> /v2）不算地址迁移
                providers: [{ ...baseSave.openai.providers[0], endpoint: 'https://api.example.com/v2', key: '' }],
            },
        });

        expect(loggerInfo.mock.calls.some(([message]) => message === 'provider endpoint host changed')).toBe(false);
    });

    it('填了新密钥才覆盖', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{ ...baseSave.openai.providers[0], key: 'sk-test-newkey-0000000000009999' }],
            },
        });

        expect(JSON.parse(store.values.get('apiKeys.openAi.providerKeys')!)).toEqual({
            deepseek: 'sk-test-newkey-0000000000009999',
        });
    });

    it('显式 clearKey 才清空', async () => {
        await service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{ ...baseSave.openai.providers[0], clearKey: true }],
            },
        });

        expect(JSON.parse(store.values.get('apiKeys.openAi.providerKeys')!)).toEqual({ deepseek: '' });
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
            'apiKeys.openAi.providerKeys': '',
        });
        const svc = createService(emptyKeysStore);

        await svc.saveServiceCredentials({
            openai: {
                activeProviderId: 'openai',
                providers: [{
                    id: 'openai',
                    name: 'OpenAI',
                    apiFormat: 'openai',
                    endpoint: 'https://api.example.com/v1',
                    models: ['gpt-4o-mini'],
                }],
            },
        });

        expect(emptyKeysStore.values.get('apiKeys.openAi.providerKeys')).toBe('');
    });

    it.each([
        'http://attacker.tld/v1',
        'ftp://example.com/v1',
        'file:///etc/passwd',
        'https://user:pass@api.example.com/v1',
        'not-a-url',
    ])('拒绝非可信协议或带认证信息的接口地址 %s', async (badEndpoint) => {
        await expect(service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{ ...baseSave.openai.providers[0], endpoint: badEndpoint }],
            },
        })).rejects.toThrow();
    });

    it.each([
        'http://localhost:11434/v1',
        'http://127.0.0.1:1234/v1',
        'http://192.168.1.25:8080/v1',
        'https://api.openai.com/v1',
        '',
    ])('允许合法的 https、空地址与本地推理 HTTP 接口地址 %s', async (goodEndpoint) => {
        await expect(service.saveServiceCredentials({
            ...baseSave,
            openai: {
                ...baseSave.openai,
                providers: [{ ...baseSave.openai.providers[0], endpoint: goodEndpoint }],
            },
        })).resolves.toBeUndefined();
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
