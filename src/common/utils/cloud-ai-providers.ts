import { CLOUD_AI_PROVIDER_PRESETS } from '@/common/constants/cloud-ai-provider-presets';
import { AI_API_FORMATS, type AiApiFormat } from '@/common/utils/cloud-ai-api-format';

/** 持久化在设置中的单个云端/本地 AI 服务商配置（不含明文密钥）。 */
export interface PersistedCloudAiProvider {
    id: string;
    name: string;
    apiFormat: AiApiFormat;
    endpoint: string;
    models: string[];
    disabledModels: string[];
}

const VALID_FORMAT_SET = new Set<string>(AI_API_FORMATS);

/**
 * 解析持久化存储的厂商密钥映射（providerId -> apiKey）。
 */
export function parseStoredProviderKeys(raw: string): Record<string, string> {
    if (!raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === 'string') {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/** 新安装尚未持久化多服务商列表时的默认服务商 ID。 */
export const DEFAULT_CLOUD_AI_PROVIDER_ID = 'deepseek';

/** 生成新安装用户的默认云端服务商配置（DeepSeek 预设，空模型列表）。 */
export function createDefaultProviderProfile(): PersistedCloudAiProvider {
    const preset = CLOUD_AI_PROVIDER_PRESETS.find((item) => item.id === DEFAULT_CLOUD_AI_PROVIDER_ID)
        ?? CLOUD_AI_PROVIDER_PRESETS[0];
    return {
        id: preset?.id ?? DEFAULT_CLOUD_AI_PROVIDER_ID,
        name: preset?.name ?? 'DeepSeek',
        apiFormat: preset?.apiFormat ?? 'openai',
        endpoint: preset?.endpoint ?? 'https://api.deepseek.com/v1',
        models: [],
        disabledModels: [],
    };
}

/** 汇总所有服务商配置中的全部模型标识（含已关闭模型，去重保序）。 */
export function flattenAllProviderModels(providers: readonly PersistedCloudAiProvider[]): string[] {
    return Array.from(new Set(providers.flatMap((provider) => provider.models)));
}

/** 汇总所有服务商配置中的已启用模型标识（去重保序）。 */
export function flattenEnabledProviderModels(
    providers: ReadonlyArray<{ models: readonly string[]; disabledModels?: readonly string[] }>,
): string[] {
    return Array.from(new Set(
        providers.flatMap((provider) => {
            const disabled = new Set(provider.disabledModels ?? []);
            return provider.models.filter((model) => !disabled.has(model));
        }),
    ));
}

/**
 * 解析持久化存储的多厂商配置列表。
 * 尚未初始化过（空字符串或非法载荷）返回 null；显式清空则返回 []。
 */
export function parseStoredProviderProfiles(raw: string): PersistedCloudAiProvider[] | null {
    if (!raw.trim()) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return null;
        if (parsed.length === 0) return [];
        const normalized: PersistedCloudAiProvider[] = [];
        for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const record = item as Record<string, unknown>;
            const id = typeof record.id === 'string' ? record.id.trim() : '';
            const name = typeof record.name === 'string' ? record.name.trim() : '';
            const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim() : '';
            const apiFormat = typeof record.apiFormat === 'string' && VALID_FORMAT_SET.has(record.apiFormat)
                ? (record.apiFormat as AiApiFormat)
                : 'openai';
            const models = Array.isArray(record.models)
                ? Array.from(new Set(record.models.filter((m): m is string => typeof m === 'string').map((m) => m.trim()).filter(Boolean)))
                : [];
            const modelSet = new Set(models);
            const disabledModels = Array.isArray(record.disabledModels)
                ? Array.from(new Set(record.disabledModels.filter((m): m is string => typeof m === 'string').map((m) => m.trim()).filter((m) => modelSet.has(m))))
                : [];
            if (!id) continue;
            normalized.push({
                id,
                name: name || id,
                apiFormat,
                endpoint,
                models,
                disabledModels,
            });
        }
        return normalized;
    } catch {
        return null;
    }
}

/**
 * 按模型 ID 或指定 providerId 查找归属服务商配置。
 */
export function findProviderForModel(
    providers: PersistedCloudAiProvider[],
    modelId: string,
    preferredProviderId?: string,
): PersistedCloudAiProvider | undefined {
    if (preferredProviderId) {
        const direct = providers.find((item) => item.id === preferredProviderId);
        if (direct) return direct;
    }
    return providers.find(
        (item) => item.models.includes(modelId) && !item.disabledModels.includes(modelId),
    ) ?? providers.find((item) => item.models.includes(modelId));
}
