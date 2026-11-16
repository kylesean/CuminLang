import type { SubtitleResolution } from '@/common/contracts/subtitle-resolution';
import type { SrtSentence } from '@/common/types/SentenceC';

/** 单条待写入 L3 `.edited.srt` 轨道的标准化字幕行。 */
export interface EditedSubtitleLineInput {
    start: number;
    end: number;
    contentEn: string;
    contentZh?: string;
}

/** 从右侧文稿原地实时保存 `.edited.srt` 的 IPC 请求载荷。 */
export interface SaveEditedSubtitleRequest {
    videoId: string;
    videoPath?: string;
    sourceSubtitlePath?: string;
    oldFileHash?: string;
    lines: EditedSubtitleLineInput[];
}

/** 保存 `.edited.srt` 后返回的最新分词字幕与轨道解析信息。 */
export interface SaveEditedSubtitleResponse {
    srt: SrtSentence;
    resolution: SubtitleResolution | null;
}
