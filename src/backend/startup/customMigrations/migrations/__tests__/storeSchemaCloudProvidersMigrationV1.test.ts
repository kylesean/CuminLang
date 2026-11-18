import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/backend/infrastructure/db/createDb';
import type { MainLogger } from '@/backend/infrastructure/logger';
import {
    resolveCloudProvidersMigrationWrites,
    storeSchemaCloudProvidersMigrationV1,
} from '../storeSchemaCloudProvidersMigrationV1';

const createMigrationContext = (persisted: Record<string, string>) => ({
    settings: {
        getPersisted: (key: string) => {
            const val = persisted[key];
            return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
        },
        hasPersisted: (key: string) => Object.prototype.hasOwnProperty.call(persisted, key),
        set: (key: string, value: string | null | undefined) => {
            persisted[key] = value ?? '';
            return true;
        },
        delete: (key: string) => {
            delete persisted[key];
        },
    },
    db: {} as Db,
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    } as unknown as MainLogger,
});

describe('storeSchemaCloudProvidersMigrationV1', () => {
    it('全新安装没有任何旧数据时不做写入', () => {
        const writes = resolveCloudProvidersMigrationWrites({
            providers: null,
            providerKeys: null,
            activeProviderId: null,
            legacyKey: null,
            legacyEndpoint: null,
            legacyApiFormat: null,
            legacyAvailable: null,
            legacyDisabled: null,
        });

        expect(writes).toEqual([]);
    });

    it('仅存在传统平坦键时升级为单一提供商配置，并保留禁用过滤与预设匹配', () => {
        const writes = resolveCloudProvidersMigrationWrites({
            providers: null,
            providerKeys: null,
            activeProviderId: null,
            legacyKey: 'sk-legacy-1234',
            legacyEndpoint: 'https://api.anthropic.com/v1',
            legacyApiFormat: 'anthropic',
            legacyAvailable: 'claude-3-7-sonnet\nclaude-3-5-haiku',
            legacyDisabled: 'claude-3-5-haiku,unknown-model',
        });

        expect(writes).toEqual([
            {
                key: 'models.openai.providers',
                value: JSON.stringify([{
                    id: 'anthropic',
                    name: 'Anthropic',
                    apiFormat: 'anthropic',
                    endpoint: 'https://api.anthropic.com/v1',
                    models: ['claude-3-7-sonnet', 'claude-3-5-haiku'],
                    disabledModels: ['claude-3-5-haiku'],
                }]),
            },
            { key: 'models.openai.activeProviderId', value: 'anthropic' },
            { key: 'apiKeys.openAi.providerKeys', value: JSON.stringify({ anthropic: 'sk-legacy-1234' }) },
        ]);
    });

    it.each(['[]', '[{"id":"openai","name":"OpenAI","apiFormat":"openai-responses","endpoint":"https://api.openai.com/v1","models":[],"disabledModels":[]}]'])(
        '已存在新版 providers（%s）时不覆盖也不重新复活旧数据',
        (existingProviders) => {
            const writes = resolveCloudProvidersMigrationWrites({
                providers: existingProviders,
                providerKeys: null,
                activeProviderId: null,
                legacyKey: 'sk-stale-legacy',
                legacyEndpoint: 'https://api.deepseek.com/v1',
                legacyApiFormat: 'openai',
                legacyAvailable: 'deepseek-chat',
                legacyDisabled: null,
            });

            expect(writes).toEqual([]);
        },
    );

    it('执行迁移后写入新格式并清理所有已废弃平坦键，重跑幂等', async () => {
        const persisted: Record<string, string> = {
            'apiKeys.openAi.key': 'sk-test-secret',
            'apiKeys.openAi.endpoint': 'https://api.deepseek.com/v1',
            'apiKeys.openAi.apiFormat': 'openai',
            'apiKeys.openAi.stream': 'on',
            'models.openai.available': 'deepseek-chat',
            'models.openai.disabled': '',
        };
        const ctx = createMigrationContext(persisted);

        await storeSchemaCloudProvidersMigrationV1.run(ctx);

        expect(JSON.parse(persisted['models.openai.providers'])).toEqual([
            {
                id: 'deepseek',
                name: 'DeepSeek',
                apiFormat: 'openai',
                endpoint: 'https://api.deepseek.com/v1',
                models: ['deepseek-chat'],
                disabledModels: [],
            },
        ]);
        expect(JSON.parse(persisted['apiKeys.openAi.providerKeys'])).toEqual({
            deepseek: 'sk-test-secret',
        });
        expect(persisted['models.openai.activeProviderId']).toBe('deepseek');
        expect(persisted['apiKeys.openAi.key']).toBeUndefined();
        expect(persisted['apiKeys.openAi.endpoint']).toBeUndefined();
        expect(persisted['apiKeys.openAi.apiFormat']).toBeUndefined();
        expect(persisted['apiKeys.openAi.stream']).toBeUndefined();
        expect(persisted['models.openai.available']).toBeUndefined();
        expect(persisted['models.openai.disabled']).toBeUndefined();

        const snapshotAfterFirst = { ...persisted };
        await storeSchemaCloudProvidersMigrationV1.run(ctx);
        expect(persisted).toEqual(snapshotAfterFirst);
    });
});
