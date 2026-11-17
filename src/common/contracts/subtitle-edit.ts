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

/** 放弃 L3 `.edited.srt` 修订、迁移学习资产并恢复到基线轨道（优先 L2 `.local.srt`）的请求载荷。 */
export interface DiscardEditedSubtitleRequest {
    videoId: string;
    videoPath?: string;
    editedSubtitlePath?: string;
    targetSubtitlePath: string;
    currentFileHash?: string;
}

/** 放弃 L3 修订并恢复基线轨道后返回的最新分词字幕与轨道解析信息。 */
export type DiscardEditedSubtitleResponse = SaveEditedSubtitleResponse;
