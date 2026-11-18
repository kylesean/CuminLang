import { AI_API_FORMATS, type AiApiFormat } from '@/common/utils/cloud-ai-api-format';
import {
    inferProviderProfileFromLegacy,
    parseStoredProviderKeys,
    parseStoredProviderProfiles,
} from '@/common/utils/cloud-ai-providers';
import type { SettingKey } from '@/common/types/store_schema';

import type { CustomMigration } from '../types';

const MIGRATION_ID = 'store-schema-cloud-providers-v1';
const DEFAULT_LEGACY_ENDPOINT = 'https://api.deepseek.com/v1';

const LEGACY_KEYS_TO_DELETE = [
    'apiKeys.openAi.key',
    'apiKeys.openAi.endpoint',
    'apiKeys.openAi.apiFormat',
    'apiKeys.openAi.stream',
    'models.openai.available',
    'models.openai.disabled',
] as const;

export interface CloudProvidersMigrationReads {
    providers: string | null;
    providerKeys: string | null;
    activeProviderId: string | null;
    legacyKey: string | null;
    legacyEndpoint: string | null;
    legacyApiFormat: string | null;
    legacyAvailable: string | null;
    legacyDisabled: string | null;
}

export interface CloudProvidersMigrationWrite {
    key: SettingKey;
    value: string;
}

const parseModelList = (raw: string | null): string[] => {
    if (!raw) return [];
    return Array.from(
        new Set(
            raw
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
};

const normalizeLegacyFormat = (raw: string | null): AiApiFormat => {
    if (raw && (AI_API_FORMATS as readonly string[]).includes(raw)) {
        return raw as AiApiFormat;
    }
    return 'openai';
};

/**
 * 计算传统单服务商配置到统一 `models.openai.providers` + `apiKeys.openAi.providerKeys` 的迁移写入。
 */
export const resolveCloudProvidersMigrationWrites = (
    reads: CloudProvidersMigrationReads,
): CloudProvidersMigrationWrite[] => {
    const existingProfiles = reads.providers ? parseStoredProviderProfiles(reads.providers) : null;
    if (existingProfiles !== null) {
        return [];
    }

    const hasLegacyData = [
        reads.legacyKey,
        reads.legacyEndpoint,
        reads.legacyApiFormat,
        reads.legacyAvailable,
        reads.legacyDisabled,
    ].some((value) => value !== null);

    if (!hasLegacyData) {
        return [];
    }

    const models = parseModelList(reads.legacyAvailable);
    const modelSet = new Set(models);
    const disabledModels = parseModelList(reads.legacyDisabled).filter((model) => modelSet.has(model));
    const profile = inferProviderProfileFromLegacy({
        endpoint: reads.legacyEndpoint?.trim() || DEFAULT_LEGACY_ENDPOINT,
        apiFormat: normalizeLegacyFormat(reads.legacyApiFormat),
        models,
        disabledModels,
    });

    const writes: CloudProvidersMigrationWrite[] = [
        { key: 'models.openai.providers', value: JSON.stringify([profile]) },
    ];
    if (!reads.activeProviderId?.trim()) {
        writes.push({ key: 'models.openai.activeProviderId', value: profile.id });
    }

    const trimmedKey = reads.legacyKey?.trim() ?? '';
    if (trimmedKey) {
        const keyMap = reads.providerKeys ? parseStoredProviderKeys(reads.providerKeys) : {};
        if (!keyMap[profile.id]) {
            keyMap[profile.id] = trimmedKey;
            writes.push({ key: 'apiKeys.openAi.providerKeys', value: JSON.stringify(keyMap) });
        }
    }

    return writes;
};

export const storeSchemaCloudProvidersMigrationV1: CustomMigration = {
    id: MIGRATION_ID,
    description: 'Consolidate legacy flat OpenAI credential/model keys into models.openai.providers and remove legacy keys',
    run: async (ctx) => {
        const writes = resolveCloudProvidersMigrationWrites({
            providers: ctx.settings.getPersisted('models.openai.providers'),
            providerKeys: ctx.settings.getPersisted('apiKeys.openAi.providerKeys'),
            activeProviderId: ctx.settings.getPersisted('models.openai.activeProviderId'),
            legacyKey: ctx.settings.getPersisted('apiKeys.openAi.key'),
            legacyEndpoint: ctx.settings.getPersisted('apiKeys.openAi.endpoint'),
            legacyApiFormat: ctx.settings.getPersisted('apiKeys.openAi.apiFormat'),
            legacyAvailable: ctx.settings.getPersisted('models.openai.available'),
            legacyDisabled: ctx.settings.getPersisted('models.openai.disabled'),
        });

        for (const { key, value } of writes) {
            ctx.settings.set(key, value);
        }

        const deletedKeys: string[] = [];
        for (const legacyKey of LEGACY_KEYS_TO_DELETE) {
            if (ctx.settings.hasPersisted(legacyKey)) {
                ctx.settings.delete(legacyKey);
                deletedKeys.push(legacyKey);
            }
        }

        ctx.logger.info('cloud providers migration applied', {
            writtenKeys: writes.map((item) => item.key),
            deletedKeys,
        });
    },
};
