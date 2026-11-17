import type { SubtitleTrackOption, SubtitleTrackOrigin } from '@/common/contracts/subtitle-resolution';

const KNOWN_TRACK_TAG_RE = /\.(local|edited|en-orig|en(?:-[A-Za-z0-9-]+)?|zh(?:-[A-Za-z0-9-]+)?)\.(?:srt|vtt|ass)$/i;
const SUBTITLE_EXT_RE = /\.(?:srt|vtt|ass)$/i;

const compactStem = (rawStem: string): string => (
    rawStem.length <= 16 ? rawStem : `${rawStem.slice(0, 14)}…`
);

const extractCleanVariantTag = (fileName: string): string | null => {
    const match = KNOWN_TRACK_TAG_RE.exec(fileName);
    if (match) {
        return match[1].toLowerCase() === 'local' || match[1].toLowerCase() === 'edited'
            ? null
            : match[1];
    }
    return null;
};

const extractCleanStem = (fileName: string): string => {
    const withoutKnown = fileName.replace(KNOWN_TRACK_TAG_RE, '').replace(SUBTITLE_EXT_RE, '');
    return compactStem(withoutKnown || fileName.replace(SUBTITLE_EXT_RE, ''));
};

/**
 * 为「字幕轨道」下拉选择器生成纯人类语义的选项标签，彻底不暴露 `.edited.srt` / `.local.srt` / `.en.srt` 裸后缀。
 *
 * - 当每类来源在当前视频只有一条轨道时，直接展示简洁语义名称（如「人工编辑」「本地识别」「自动字幕」）；
 * - 仅当同一来源存在多条轨道时，在括号内追加干净的语言/变体或短文件名消歧（如「自动字幕 (en)」「自动字幕 (en-orig)」）。
 */
export function formatSubtitleTrackOptions(
    tracks: readonly SubtitleTrackOption[],
    originLabel: (origin: SubtitleTrackOrigin) => string,
): Array<{ value: string; label: string }> {
    const baseLabels = tracks.map((track) => originLabel(track.origin));
    const originCounts = new Map<string, number>();
    for (const label of baseLabels) {
        originCounts.set(label, (originCounts.get(label) ?? 0) + 1);
    }

    const rawTags = tracks.map((track) => extractCleanVariantTag(track.fileName) ?? extractCleanStem(track.fileName));
    const baseTagCounts = new Map<string, number>();
    tracks.forEach((_, index) => {
        if ((originCounts.get(baseLabels[index]) ?? 0) <= 1) return;
        const pairKey = `${baseLabels[index]}::${rawTags[index]}`;
        baseTagCounts.set(pairKey, (baseTagCounts.get(pairKey) ?? 0) + 1);
    });

    return tracks.map((track, index) => {
        const base = baseLabels[index];
        if ((originCounts.get(base) ?? 0) <= 1) {
            return { value: track.path, label: base };
        }
        const tag = rawTags[index];
        const pairKey = `${base}::${tag}`;
        if ((baseTagCounts.get(pairKey) ?? 0) <= 1) {
            return { value: track.path, label: `${base} (${tag})` };
        }
        const stem = extractCleanStem(track.fileName);
        return {
            value: track.path,
            label: stem && stem !== tag ? `${base} (${stem} · ${tag})` : `${base} (${tag})`,
        };
    });
}
