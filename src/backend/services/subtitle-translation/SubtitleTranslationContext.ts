import type ModelRoutingService from '@/backend/services/ModelRoutingService';
import type SettingService from '@/backend/services/SettingService';
import {
    buildSubtitleStorageMode,
    type SubtitleTranslationStorageMode,
} from '@/backend/services/subtitle-translation/SubtitleTranslationStorageMode';
import { resolveSubtitleStyleWithSignature } from '@/common/constants/openaiSubtitlePrompts';
import type { TranslationMode, TranslationProvider } from '@/common/types/TranslationResult';

/**
 * 字幕翻译的 provider 设置取值。
 */
export type TranslationProviderSetting = NonNullable<
    Awaited<ReturnType<SettingService['getCurrentTranslationProvider']>>
>;

/**
 * 归一化 provider 设置。
 */
export const normalizeTranslationProvider = (raw: TranslationProviderSetting): TranslationProvider => raw;

/**
 * 上下文解析依赖：设置与模型路由服务。
 */
export interface SubtitleTranslationContextDeps {
    /** 设置业务服务。 */
    settingService: SettingService;
    /** 模型路由配置服务。 */
    modelRoutingService: ModelRoutingService;
}

/**
 * 当前设置解析出的字幕翻译稳定上下文。
 */
export interface ResolvedSubtitleTranslationContext {
    /** 当前翻译模式（zh 等）。 */
    mode: TranslationMode;
    /** 持久化缓存模式（含引擎与模型标识）。 */
    storageMode: SubtitleTranslationStorageMode;
    /** OpenAI 兼容批量提示词使用的风格约束；腾讯引擎为 undefined。 */
    style?: string;
    /** 风格签名。 */
    styleSignature: string;
    /** 调度器使用的 profileKey。 */
    profileKey: string;
}

/**
 * 解析当前设置对应的风格、持久化缓存模式与调度 profileKey。
 */
export const resolveSubtitleTranslationContext = async (
    deps: SubtitleTranslationContextDeps,
    provider: TranslationProvider,
): Promise<ResolvedSubtitleTranslationContext> => {
    if (provider === 'tencent') {
        return { mode: 'zh', storageMode: 'tencent', styleSignature: '', profileKey: 'tencent' };
    }
    const mode = await deps.settingService.getOpenAiSubtitleTranslationMode();
    const customStyle = mode === 'custom'
        ? await deps.settingService.getOpenAiSubtitleCustomStyle()
        : undefined;
    const resolved = resolveSubtitleStyleWithSignature(mode, customStyle);
    const routed = deps.modelRoutingService.resolveOpenAiModel('subtitleTranslation');
    const storageMode = buildSubtitleStorageMode('openai', routed.modelId, mode, resolved.signature);
    return {
        mode,
        storageMode,
        style: resolved.style,
        styleSignature: resolved.signature,
        profileKey: `${storageMode}:${routed.fullModelId}`,
    };
};
