/**
 * 整句学习页的展示层视图模型。
 *
 * 说明：AI SDK 的消息片段在 useSentenceLearningChat 里一次性转换成这里定义的纯数据结构，
 * 页面组件只消费视图模型，不再关心工具调用协议，方便单独预览与迭代版式。
 */

export type { LearningMessageBlock } from '@/common/types/chat';
import type { LearningMessageBlock } from '@/common/types/chat';

/** 页面上一条对话消息。 */
export type LearningMessageView = {
    id: string;
    role: 'user' | 'assistant';
    blocks: LearningMessageBlock[];
};

/** 句子解析的生命周期状态。aborted = 被用户中止：半成品卡片保留展示，可重新生成。 */
export type AnalysisStatus = 'idle' | 'streaming' | 'done' | 'error' | 'aborted';
