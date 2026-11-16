import { describe, expect, it, vi } from 'vitest';
import { storeSchemaRemoveLocalLlmMigrationV1 } from '../storeSchemaRemoveLocalLlmMigrationV1';
import type { CustomMigrationContext } from '../../types';

const buildContext = (initial: Record<string, string>) => {
    const store = new Map<string, string>(Object.entries(initial));
    const sets: Array<{ key: string; value: string | null | undefined }> = [];
    const deletes: string[] = [];

    const ctx: CustomMigrationContext = {
        settings: {
            getPersisted: (key) => store.get(key) ?? null,
            hasPersisted: (key) => store.has(key),
            set: (key, value) => {
                sets.push({ key, value });
                if (value === null || value === undefined || value === '') {
                    store.delete(key);
                } else {
                    store.set(key, value);
                }
                return true;
            },
            delete: (key) => {
                deletes.push(key);
                store.delete(key);
            },
        },
        db: {} as never,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        } as never,
    };

    return { ctx, sets, deletes, store };
};

describe('storeSchemaRemoveLocalLlmMigrationV1', () => {
    it('将遗留 local / local-mt 引擎与整句学习 local 槽位清理为未配置并删除 models.local.active', async () => {
        const { ctx, sets, deletes, store } = buildContext({
            'providers.subtitleTranslation': 'local',
            'providers.dictionary': 'local',
            'models.openai.sentenceLearning': 'local',
            'features.openai.enableSentenceLearning': 'true',
            'models.local.active': 'qwen3.5-2b-q4_k_m',
        });

        await storeSchemaRemoveLocalLlmMigrationV1.run(ctx);

        expect(sets).toEqual([
            { key: 'providers.subtitleTranslation', value: 'none' },
            { key: 'providers.dictionary', value: 'none' },
            { key: 'models.openai.sentenceLearning', value: '' },
            { key: 'features.openai.enableSentenceLearning', value: 'false' },
        ]);
        expect(deletes).toEqual(['models.local.active']);
        expect(store.has('models.local.active')).toBe(false);
    });

    it('已迁移到统一配置的安装执行时保持幂等、不修改正常配置', async () => {
        const { ctx, sets, deletes } = buildContext({
            'providers.subtitleTranslation': 'openai',
            'providers.dictionary': 'openai',
            'models.openai.sentenceLearning': 'qwen2.5:7b',
            'features.openai.enableSentenceLearning': 'true',
        });

        await storeSchemaRemoveLocalLlmMigrationV1.run(ctx);

        expect(sets).toEqual([]);
        expect(deletes).toEqual([]);
    });
});
