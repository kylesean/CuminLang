import type ModelRoutingService from '@/backend/services/ModelRoutingService';
import {
    buildSubtitleStorageMode,
    type SubtitleTranslationStorageMode,
} from '@/backend/services/subtitle-translation/SubtitleTranslationStorageMode';
import { resolveSubtitleStyleWithSignature } from '@/common/constants/openaiSubtitlePrompts';
import type { TranslationProvider } from '@/common/types/TranslationResult';

/**
 * 上下文解析依赖：模型路由服务。
 */
export interface SubtitleTranslationContextDeps {
    /** 模型路由配置服务。 */
    modelRoutingService: ModelRoutingService;
}

/**
 * 当前设置解析出的字幕翻译稳定上下文。
 */
export interface ResolvedSubtitleTranslationContext {
    /** 持久化缓存模式（含引擎、模型标识与风格签名）。 */
    storageMode: SubtitleTranslationStorageMode;
    /** 批量提示词使用的风格约束。 */
    style: string;
    /** 风格签名。 */
    styleSignature: string;
    /** 调度器使用的 profileKey。 */
    profileKey: string;
}

/**
 * 解析当前设置对应的风格、持久化缓存模式与调度 profileKey。
 */
export const resolveSubtitleTranslationContext = (
    deps: SubtitleTranslationContextDeps,
    _provider: TranslationProvider,
): ResolvedSubtitleTranslationContext => {
    const resolved = resolveSubtitleStyleWithSignature();
    const routed = deps.modelRoutingService.resolveOpenAiModel('subtitleTranslation');
    const storageMode = buildSubtitleStorageMode('openai', routed.modelId, resolved.signature);
    return {
        storageMode,
        style: resolved.style,
        styleSignature: resolved.signature,
        profileKey: `${storageMode}:${routed.fullModelId}`,
    };
};
