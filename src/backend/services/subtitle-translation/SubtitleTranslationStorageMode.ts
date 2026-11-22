/**
 * 字幕翻译缓存的持久化模式。
 *
 * 统一用 '#' 分段：`openai#模型#风格签名`。
 * 不用 '_' 分段是因为模型 ID 自带下划线，混在一起无法辨认分段边界。
 */
export type SubtitleTranslationStorageMode = `openai#${string}`;

/**
 * 将引擎、路由到的模型 ID 与风格签名映射为持久化模式。
 */
export const buildSubtitleStorageMode = (
    engine: 'openai',
    modelId: string,
    signature: string
): SubtitleTranslationStorageMode => `${engine}#${modelId}#${signature}`;
