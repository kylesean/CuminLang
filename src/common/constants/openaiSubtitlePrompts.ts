/**
 * 字幕翻译风格的默认值与签名逻辑。
 *
 * 批量提示词模板与拼装已下放到网关实现
 * （见 src/backend/infrastructure/translate/subtitleBatchPrompt.ts），
 * 这里只保留中文翻译风格文案与签名，供提示词与缓存分区使用。
 */

export const OPENAI_SUBTITLE_ZH_STYLE =
    '将原句自然、口语化地翻译成简体中文，语序可适度调整以保证流畅易读，保留原句语气与情感。译文以字幕节奏为准：简洁凝练，长度与源文信息量相称，避免逐词直译造成的冗长。';

const normalizeStyle = (value: string): string =>
    value
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .trim();

const hashString = (value: string): string => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const resolveSubtitleStyleWithSignature = (): { style: string; signature: string } => {
    const normalized = normalizeStyle(OPENAI_SUBTITLE_ZH_STYLE);
    const signature = `zh_${hashString(`zh::${normalized}`)}`;
    return { style: OPENAI_SUBTITLE_ZH_STYLE, signature };
};
