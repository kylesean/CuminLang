import type { TranslationMode } from '@/common/types/TranslationResult';

/**
 * 字幕翻译缓存的持久化模式。
 *
 * 除 'tencent' 外统一用 '#' 分段：`openai#模型#模式#风格签名`。
 * 不用 '_' 分段是因为模型 ID 自带下划线，混在一起无法辨认分段边界。
 */
export type SubtitleTranslationStorageMode = 'tencent' | `openai#${string}`;

/**
 * 将引擎、路由到的模型 ID、翻译模式与风格签名映射为持久化模式。
 */
export const buildSubtitleStorageMode = (
    engine: 'openai',
    modelId: string,
    mode: TranslationMode,
    signature: string
): SubtitleTranslationStorageMode => `${engine}#${modelId}#${mode}#${signature}`;
