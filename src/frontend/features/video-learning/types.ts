import type { ClipSrtLine } from '@/common/types/clipMeta';
import type { ClipVocabularyEntry } from '@/common/types/vo/VideoLearningClipVO';
import type { WordSource, WordStatus } from '@/common/types/vocabulary';

/**
 * 上下文工作台使用的词汇条目视图模型。
 */
export interface WordItem {
    id: number;
    word: string;
    translate: string;
    created_at: string;
    updated_at: string;
    /** 学习状态；旧数据可能没有该字段。 */
    status?: WordStatus;
    /** 状态来源。 */
    source?: WordSource;
    videoCount?: number;
    /** 最近一次被添加视频（生成关联片段）的时间；没有关联片段时为 null。 */
    lastClipAddedAt?: string | null;
}

/**
 * 视频学习页使用的片段视图模型。
 */
export interface VideoClip {
    /** 片段唯一键。 */
    key: string;
    /** 片段来源类型。 */
    sourceType: 'oss' | 'local';
    /** 原视频名称。 */
    videoName: string;
    /** 原视频路径。 */
    videoPath: string;
    /** 片段创建时间戳。 */
    createdAt: number;
    /** 片段对应的字幕行。 */
    clipContent: ClipSrtLine[];
    /** 片段关联的词汇信息。 */
    vocabulary: ClipVocabularyEntry[];
}
