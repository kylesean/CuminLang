import { injectable } from 'inversify';
import { storeGet } from '@/backend/infrastructure/settings/store';
import type { AiModelScene } from '@/backend/services/AiProviderService';
import type { SettingKey } from '@/common/types/store_schema';
import {
    findProviderForModel,
    flattenEnabledProviderModels,
    parseStoredProviderProfiles,
} from '@/common/utils/cloud-ai-providers';

const API_FORMAT_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    openai: 'OpenAI',
    'openai-responses': 'OpenAI',
};

export type RoutedModel = {
    providerId: 'openai';
    modelId: string;
    fullModelId: string;
};

export default interface ModelRoutingService {
    resolveOpenAiModel(scene: AiModelScene): RoutedModel;
    /** 解析指定场景实际命中服务商的展示名（用于提示语展示真实配置供应商）。 */
    resolveProviderLabel?(scene: AiModelScene): string;
}


@injectable()
export class ModelRoutingServiceImpl implements ModelRoutingService {
    /**
     * 将 AI 使用场景映射到对应的模型设置键。
     * @param scene 当前 AI 使用场景。
     * @returns 该场景保存模型标识的设置键。
     */
    private resolveFeatureKey(scene: AiModelScene): string {
        if (scene === 'sentenceLearning') {
            return 'models.openai.sentenceLearning';
        }
        if (scene === 'subtitleTranslation') {
            return 'models.openai.subtitleTranslation';
        }
        return 'models.openai.dictionary';
    }

    /**
     * 解析场景当前选择的 OpenAI 模型，并严格校验它仍在服务配置清单中。
     * @param scene 当前 AI 使用场景。
     * @returns 已校验的模型路由；配置缺失或失效时直接抛错。
     */
    public resolveOpenAiModel(scene: AiModelScene): RoutedModel {
        const profiles = parseStoredProviderProfiles(storeGet('models.openai.providers')) ?? [];
        const availableModels = flattenEnabledProviderModels(profiles);
        if (availableModels.length === 0) {
            throw new Error('OpenAI 可用模型列表为空，请先在服务配置中添加或启用模型');
        }
        const modelKey = this.resolveFeatureKey(scene) as SettingKey;
        const selectedModel = storeGet(modelKey);
        if (!availableModels.includes(selectedModel)) {
            throw new Error(`当前模型未在服务配置中启用: ${selectedModel}`);
        }

        return {
            providerId: 'openai',
            modelId: selectedModel,
            fullModelId: `openai:${selectedModel}`,
        };
    }

    /**
     * 解析当前场景在“服务凭据”中实际命中供应商的名称，用于状态与失败提示。
     */
    public resolveProviderLabel(scene: AiModelScene): string {
        try {
            const routed = this.resolveOpenAiModel(scene);
            const profiles = parseStoredProviderProfiles(storeGet('models.openai.providers')) ?? [];
            const matched = findProviderForModel(profiles, routed.modelId);
            if (matched) {
                return matched.name.trim() || (API_FORMAT_LABELS[matched.apiFormat] ?? 'AI');
            }
            return 'AI';
        } catch {
            return 'AI';
        }
    }
}
