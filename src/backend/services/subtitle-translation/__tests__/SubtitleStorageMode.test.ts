import { describe, expect, it } from 'vitest';
import { buildSubtitleStorageMode } from '@/backend/services/subtitle-translation/SubtitleTranslationStorageMode';

/**
 * 字幕翻译缓存键是"引擎#模型#风格签名"的稳定契约：
 * 切换引擎、模型或风格中的任何一项都必须落到不同的缓存分区，
 * 否则切换后会把旧配置的译文当作缓存命中复用。
 */
describe('字幕翻译缓存键按配置隔离', () => {
    it('OpenAI 兼容引擎的缓存键包含路由到的模型 ID，不同模型互不复用缓存', () => {
        const modelA = buildSubtitleStorageMode('openai', 'gpt-5.4-nano', 'sig');
        const modelB = buildSubtitleStorageMode('openai', 'qwen2.5:7b', 'sig');
        expect(modelA).toBe('openai#gpt-5.4-nano#sig');
        expect(modelB).toBe('openai#qwen2.5:7b#sig');
        expect(modelA).not.toBe(modelB);
    });

    it('模型 ID 自带的下划线不会破坏 # 分段，各段都能正确辨认', () => {
        const mode = buildSubtitleStorageMode('openai', 'qwen_2_5_local', 'abc123');
        expect(mode.split('#')).toEqual(['openai', 'qwen_2_5_local', 'abc123']);
    });

    it('不同的风格签名产生不同的缓存键', () => {
        const defaultStyle = buildSubtitleStorageMode('openai', 'gpt-5.4-nano', 'sig');
        const otherStyle = buildSubtitleStorageMode('openai', 'gpt-5.4-nano', 'other');
        expect(defaultStyle).not.toBe(otherStyle);
    });
});
