import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import {
    flattenEnabledProviderModels,
    parseStoredProviderKeys,
    parseStoredProviderProfiles,
    type PersistedCloudAiProvider,
} from '@/common/utils/cloud-ai-providers';

/**
 * AI SDK 升级验证测试的配置读取。
 *
 * 读取开发环境配置文件（Electron userData 下的 config.dev.json），
 * 文件缺失、解析失败或 Key 不完整时返回 null，由测试用例自行跳过。
 */
export type AiSdkTestConfig = {
    key: string;
    endpoint: string;
    model: string;
    provider: PersistedCloudAiProvider;
    sentenceLearningModel: string;
};

const resolveUserDataDir = (): string => {
    let base: string;
    if (process.platform === 'darwin') {
        base = path.join(os.homedir(), 'Library', 'Application Support');
    } else if (process.platform === 'win32') {
        base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    } else {
        base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
    }
    return path.join(base, 'CuminLang');
};

export const loadAiSdkTestConfig = (): AiSdkTestConfig | null => {
    const devConfigPath = path.join(resolveUserDataDir(), 'config.dev.json');
    if (!existsSync(devConfigPath)) {
        return null;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(devConfigPath, 'utf8'));
    } catch {
        return null;
    }
    const config = raw as {
        apiKeys?: { openAi?: { providerKeys?: string } };
        models?: { openai?: { providers?: string; activeProviderId?: string; sentenceLearning?: string } };
    };
    const profiles = parseStoredProviderProfiles(config.models?.openai?.providers ?? '');
    if (!profiles || profiles.length === 0) {
        return null;
    }
    const activeId = config.models?.openai?.activeProviderId?.trim();
    const provider = profiles.find((item) => item.id === activeId) ?? profiles[0];
    const keyMap = parseStoredProviderKeys(config.apiKeys?.openAi?.providerKeys ?? '');
    const key = (keyMap[provider.id] ?? '').trim();
    const endpoint = provider.endpoint.trim();
    if (!key || !endpoint) {
        return null;
    }
    const sentenceModel = config.models?.openai?.sentenceLearning?.trim() ?? '';
    const availableModels = flattenEnabledProviderModels(profiles);
    const model = sentenceModel && availableModels.includes(sentenceModel)
        ? sentenceModel
        : (availableModels[0] ?? 'gpt-5.4-nano');
    return { key, endpoint, model, provider, sentenceLearningModel: sentenceModel };
};
