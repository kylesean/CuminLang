/**
 * 字幕文本中的非人声舞台/音效标注清理工具。
 *
 * 典型来源：YouTube ASR 自动字幕与听障字幕中的 `[music]`、`[cheering]`、
 * `[applause]`、`[laughter]`、`[clears throat]`、`(laughter)`、`♪` 等。
 * 这类标记不是可学习的英语口语文本，还会阻断滚动去重、切碎正常句子。
 */

/** 方括号舞台/音效标注（如 `[music]`、`[cheering and applause]`）。 */
export const BRACKET_STAGE_CUE_RE = /\[[^\]]*\]/g;

/** 圆括号中的常见非人声标注，保留 `(about)` 这类普通语义括号。 */
export const PAREN_SOUND_CUE_RE = /\([^)]*\b(?:music|applause|laughter|laughing|laughs?|chuckles?|cheering|clapping|sighs?|groans?|coughs?|clears?\s+throat|inaudible|silence|noise|sfx|singing|panting|screaming|crying|whispering|snoring|bleep|beep)\b[^)]*\)/gi;

/** 音乐符号（`♪`、`♫`）。 */
export const MUSIC_SYMBOL_RE = /[♪♫]+/g;

/** 说话人切换符号 `>>`。 */
export const SPEAKER_CHEVRON_TOKEN_RE = /^>>+$/;

/**
 * 剥离文本中的舞台/音效标注，保留 `>>` 说话人标记供断句阶段处理。
 *
 * @param text 原始文本。
 * @returns 清理后的文本与是否包含舞台标记。
 */
export const stripStageSoundCues = (text: string): { text: string; hadStageCue: boolean } => {
    if (!text) {
        return { text: '', hadStageCue: false };
    }
    const stripped = text
        .replace(BRACKET_STAGE_CUE_RE, ' ')
        .replace(PAREN_SOUND_CUE_RE, ' ')
        .replace(MUSIC_SYMBOL_RE, ' ');
    const hadStageCue = stripped !== text;
    if (!hadStageCue) {
        return { text, hadStageCue: false };
    }
    const cleaned = stripped
        .replace(/\s+([,.!?;:…])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return { text: cleaned, hadStageCue: true };
};
