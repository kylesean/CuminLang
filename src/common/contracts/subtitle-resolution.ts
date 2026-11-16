/**
 * 字幕解析与多轨道来源诊断的跨进程契约。
 */

/** 字幕轨道的来源与质量分类。 */
export type SubtitleTrackOrigin = 'user_edited' | 'local_asr' | 'author' | 'auto_asr' | 'external';

/** 字幕质量告警类型：平台自动字幕误差，或外挂字幕时间轴严重拉跨/缺段。 */
export type SubtitleQualityIssue = 'auto_asr' | 'timing_anomaly';

/** 单个视频关联的可选字幕轨信息。 */
export interface SubtitleTrackOption {
    /** 字幕文件绝对路径。 */
    path: string;
    /** 展示用文件名。 */
    fileName: string;
    /** 字幕来源分类。 */
    origin: SubtitleTrackOrigin;
    /** 若轨道质量存在明显缺陷，标出具体诊断原因。 */
    qualityIssue?: SubtitleQualityIssue;
    /** 是否为当前激活轨道。 */
    active: boolean;
}

/**
 * 字幕解析结论，由后端解析后经 IPC 返回 renderer。
 *
 * `mismatchSuspected` 为 true 表示字幕是靠模糊兜底匹配到的且文件名与视频存疑，
 * 可能是别的视频的字幕，前端据此引导用户重新生成字幕。
 */
export interface SubtitleResolution {
    /** 字幕文件路径；未匹配到时为空字符串。 */
    subtitlePath: string;
    /** 字幕文件名与视频对不上、疑似挂错。 */
    mismatchSuspected: boolean;
    /**
     * 本次解析自动升级前的字幕路径。
     *
     * 仅当「原挂 ASR 轨、同目录存在更优作者轨」时出现。调用方据此回写
     * `dp_watch_history.srt_file`，让数据库记录与实际播放保持一致。
     */
    upgradedFrom?: string;
    /** 当前命中字幕的来源分类。 */
    origin?: SubtitleTrackOrigin;
    /** 当前命中字幕的质量告警；高质量轨为 undefined。 */
    qualityIssue?: SubtitleQualityIssue;
    /** 当前视频同目录下匹配到的全部可用字幕轨（已按内容去重）。 */
    tracks?: SubtitleTrackOption[];
}
