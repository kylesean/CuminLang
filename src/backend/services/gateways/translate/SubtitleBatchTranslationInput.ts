/**
 * 字幕翻译网关目标条目。
 */
export interface SubtitleTranslationTarget {
    /** 必须原样返回的稳定字幕键。 */
    key: string;
    /** 待翻译的字幕原文。 */
    text: string;
}

/**
 * 字幕翻译网关返回条目。
 */
export interface SubtitleTranslationResultItem {
    /** 模型返回的字幕键。 */
    key: string;
    /** 模型返回的翻译文本。 */
    translation: string;
}

/**
 * 一次批量字幕翻译的语义输入。
 *
 * 业务层只描述"翻什么、带什么上下文、按什么风格"，提示词拼装、
 * 结构化输出格式与重试策略由网关基础设施实现自持，业务层不感知。
 */
export interface SubtitleBatchTranslationInput {
    /** 当前组：本批需要翻译的全部句子，按坐标升序。 */
    targets: SubtitleTranslationTarget[];
    /** 当前组的前一句（只读上下文）；无邻居时为空数组。 */
    contextBefore: SubtitleTranslationTarget[];
    /** 当前组的后一句（只读上下文）；无邻居时为空数组。 */
    contextAfter: SubtitleTranslationTarget[];
    /** 风格约束文本；由业务层解析保证非空。 */
    style: string;
    /** 取消信号；跳转或会话释放后的过期请求用它停止。 */
    signal: AbortSignal;
}
