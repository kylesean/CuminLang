import type {
    SubtitleQualityIssue,
    SubtitleTrackOption,
    SubtitleTrackOrigin,
} from '@/common/contracts/subtitle-resolution';
import { parseSrt } from './parser';
import { BRACKET_STAGE_CUE_RE, MUSIC_SYMBOL_RE, stripStageSoundCues } from './stage-cues';

/** 应用本地语音识别/音文对账生成轨道的固定后缀（不覆盖原始外挂或 YouTube 字幕）。 */
export const LOCAL_ASR_TRACK_SUFFIX = '.local.srt';

/** 用户在文稿区原地改写保存后的权威轨道后缀（最高优先级，绝不被后台自动覆盖）。 */
export const USER_EDITED_TRACK_SUFFIX = '.edited.srt';

/** 判定相邻字幕时间轴重叠的容差（秒）。 */
const OVERLAP_TOLERANCE_SECONDS = 0.05;
/** 相邻字幕重叠比例达到该阈值即判定为滚屏自动字幕。 */
const ROLLING_OVERLAP_RATIO_THRESHOLD = 0.25;
/** 含 `[music]`/`>>` 等舞台噪音标注的字幕占比阈值。 */
const STAGE_MARKER_RATIO_THRESHOLD = 0.12;
/** 判定单条人声 cue 时间轴严重拉跨的最小持续时长（秒）。 */
const SPARSE_CUE_MIN_SECONDS = 20;
/** 判定单条人声 cue 时间轴严重拉跨的最高词速（词/秒）。 */
const SPARSE_CUE_MAX_WPS = 0.8;
/** 出现达到该数量的严重拉跨 cue，判定整轨存在缺段/时间轴异常。 */
const SPARSE_CUE_COUNT_THRESHOLD = 3;

const SPEAKER_OR_STAGE_RE = new RegExp(
    `${BRACKET_STAGE_CUE_RE.source}|${MUSIC_SYMBOL_RE.source}|>>`,
    'i',
);

/** 字幕轨质量体检结论。 */
export interface SubtitleTrackDiagnostics {
    origin: SubtitleTrackOrigin;
    qualityIssue?: SubtitleQualityIssue;
}

/**
 * 结合文件名与字幕文本内容诊断轨道来源与质量问题。
 *
 * 除识别伪装成 `.en.srt` 的 YouTube 自动字幕外，还能检出部分作者轨存在的
 * 「单条 20~60 秒但只有几个词、疑似大段漏翻」时间轴异常。
 *
 * @param content 字幕全文；无法读取或非文本格式时传 `null`，退化为文件名判断。
 * @param fileName 字幕文件名。
 * @returns 来源分类与质量告警。
 */
export const inspectSubtitleTrackDiagnostics = (
    content: string | null,
    fileName: string,
): SubtitleTrackDiagnostics => {
    const lower = fileName.toLowerCase();
    if (isUserEditedSubtitleFile(lower)) {
        return { origin: 'user_edited' };
    }
    if (isLocalAsrSubtitleFile(lower)) {
        return { origin: 'local_asr' };
    }
    if (/\.en-orig\.srt$/i.test(lower)) {
        return { origin: 'auto_asr', qualityIssue: 'auto_asr' };
    }
    let hasTimingAnomaly = false;
    if (content !== null && /\.srt$/i.test(lower)) {
        const cues = parseSrt(content);
        if (cues.length >= 2) {
            let overlapCount = 0;
            for (let index = 1; index < cues.length; index++) {
                if (cues[index].start < cues[index - 1].end - OVERLAP_TOLERANCE_SECONDS) {
                    overlapCount += 1;
                }
            }
            const stageMarkerCount = cues.filter((cue) => SPEAKER_OR_STAGE_RE.test(cue.contentEn)).length;
            const overlapRatio = overlapCount / (cues.length - 1);
            const stageMarkerRatio = stageMarkerCount / cues.length;
            if (
                overlapRatio >= ROLLING_OVERLAP_RATIO_THRESHOLD
                || stageMarkerRatio >= STAGE_MARKER_RATIO_THRESHOLD
            ) {
                return { origin: 'auto_asr', qualityIssue: 'auto_asr' };
            }

            let sparseCount = 0;
            for (const cue of cues) {
                const duration = cue.end - cue.start;
                if (duration < SPARSE_CUE_MIN_SECONDS) continue;
                const spoken = stripStageSoundCues(cue.contentEn).text.trim();
                if (!spoken) continue;
                const wordCount = spoken.split(/\s+/).filter(Boolean).length;
                if (wordCount / duration < SPARSE_CUE_MAX_WPS) {
                    sparseCount += 1;
                }
            }
            hasTimingAnomaly = sparseCount >= SPARSE_CUE_COUNT_THRESHOLD;
        }
    }
    const origin: SubtitleTrackOrigin = /\.en(?:g|lish)?\.srt$/i.test(lower) ? 'author' : 'external';
    return hasTimingAnomaly ? { origin, qualityIssue: 'timing_anomaly' } : { origin };
};

/**
 * 判断字幕文件名是否为应用本地识别生成的 `.local.srt` 轨。
 *
 * @param fileName 字幕文件名或路径。
 * @returns 为 `.local.srt` 结尾时返回 true。
 */
export const isLocalAsrSubtitleFile = (fileName: string): boolean =>
    /\.local\.srt$/i.test(fileName);

/**
 * 判断字幕文件名是否为用户手工编辑保存的 `.edited.srt` 权威轨。
 *
 * @param fileName 字幕文件名或路径。
 * @returns 为 `.edited.srt` 结尾时返回 true。
 */
export const isUserEditedSubtitleFile = (fileName: string): boolean =>
    /\.edited\.srt$/i.test(fileName);

/**
 * 判断字幕路径是否为已定型权威轨（`.edited.srt` 或 `.local.srt`）。
 *
 * 已定型权威轨本身就是规范化意群行，加载时严格 1:1 直读，不再二次重切，
 * 既避免损坏用户手工拆分/合并的行边界，也避免本地 ASR 精听句被二次改写。
 *
 * @param filePath 字幕文件名或路径。
 * @returns 应跳过意群重切时返回 true。
 */
export const isAuthoritativeSubtitlePath = (filePath: string): boolean =>
    isUserEditedSubtitleFile(filePath) || isLocalAsrSubtitleFile(filePath);

/**
 * 结合文件名与字幕文本内容诊断轨道来源分类。
 *
 * @param content 字幕全文；无法读取或非文本格式时传 `null`。
 * @param fileName 字幕文件名。
 * @returns 轨道来源分类。
 */
export const inspectSubtitleTrackOrigin = (
    content: string | null,
    fileName: string,
): SubtitleTrackOrigin => inspectSubtitleTrackDiagnostics(content, fileName).origin;

const ORIGIN_SORT_PRIORITY: Record<SubtitleTrackOrigin, number> = {
    user_edited: 0,
    local_asr: 1,
    author: 2,
    external: 3,
    auto_asr: 4,
};

/** 候选轨道诊断输入。 */
export interface RawSubtitleTrackCandidate {
    path: string;
    fileName: string;
    content: string | null;
}

/**
 * 构建供前端切换的去重轨道列表。
 *
 * 内容完全相同的轨道（典型场景：YouTube 无人工轨时 `.en.srt` 与 `.en-orig.srt`
 * 字节完全一致）只保留一条，优先保留当前激活轨或名称更优者。
 *
 * @param candidates 候选轨道列表。
 * @param activePath 当前激活的字幕绝对路径。
 * @returns 排序且去重后的轨道列表。
 */
export const buildSubtitleTrackOptions = (
    candidates: readonly RawSubtitleTrackCandidate[],
    activePath: string,
): SubtitleTrackOption[] => {
    const diagnosed = candidates.map((candidate) => {
        const diag = inspectSubtitleTrackDiagnostics(candidate.content, candidate.fileName);
        return {
            ...candidate,
            origin: diag.origin,
            ...(diag.qualityIssue ? { qualityIssue: diag.qualityIssue } : {}),
            active: Boolean(activePath) && candidate.path === activePath,
        };
    });

    // 先按激活态与质量优先排，确保内容去重时留下最该展示的一条。
    diagnosed.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        const priDiff = ORIGIN_SORT_PRIORITY[a.origin] - ORIGIN_SORT_PRIORITY[b.origin];
        if (priDiff !== 0) return priDiff;
        const aIsEnOrig = /\.en-orig\.srt$/i.test(a.fileName);
        const bIsEnOrig = /\.en-orig\.srt$/i.test(b.fileName);
        if (aIsEnOrig !== bIsEnOrig) return aIsEnOrig ? 1 : -1;
        return a.fileName.localeCompare(b.fileName);
    });

    const seenContents = new Set<string>();
    const options: SubtitleTrackOption[] = [];
    for (const item of diagnosed) {
        if (item.content !== null) {
            const normalized = item.content.trim();
            if (seenContents.has(normalized)) {
                continue;
            }
            seenContents.add(normalized);
        }
        options.push({
            path: item.path,
            fileName: item.fileName,
            origin: item.origin,
            ...(item.qualityIssue ? { qualityIssue: item.qualityIssue } : {}),
            active: item.active,
        });
    }
    return options;
};
