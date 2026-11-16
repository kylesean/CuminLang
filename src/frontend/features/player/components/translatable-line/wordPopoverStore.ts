import { create } from 'zustand';

/** 浮层锚点矩形快照。 */
export interface WordPopoverRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

/** 当前激活的单词/短语查词浮层目标。 */
export interface WordPopoverTarget {
    kind: 'word' | 'phrase';
    /** 用于精确匹配当前高亮触发节点的稳定键。 */
    popKey: string;
    /** 展示和收藏用的词或词组文本（词组以单空格拼接）。 */
    word: string;
    /** 传给词典查询的原文词形。 */
    original: string;
    /** 用于查记忆历史与词汇状态的规范化小写键。 */
    cleanWord: string;
    /** 句中原型（如 running -> run）。 */
    lemma?: string;
    /** 所在完整句子原文。 */
    sentenceText?: string;
    sentenceIndex?: number;
    sentenceHash?: string;
    alwaysDark?: boolean;
    wordClassNames?: {
        openaiContainer?: string;
        refreshButton?: string;
    };
    /** 单词级浮层的 DOM 锚点。 */
    triggerEl: HTMLElement | null;
    /** 触发瞬间捕获的单词边界矩形，用于在字幕切换卸载原 DOM 后避免浮层退化到 (0,0)。 */
    anchorRect?: WordPopoverRect | null;
    /** 划词多词浮层的虚拟选区边界矩形。 */
    virtualRect?: WordPopoverRect | null;
}

export type WordPopoverTriggerMode = 'hover' | 'click' | 'selection';

interface WordPopoverState {
    open: boolean;
    mode: WordPopoverTriggerMode;
    target: WordPopoverTarget | null;
    scheduleHoverOpen: (target: WordPopoverTarget, delayMs?: number) => void;
    cancelHoverOpen: () => void;
    openImmediately: (target: WordPopoverTarget, mode: WordPopoverTriggerMode) => void;
    closePopover: () => void;
}

let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;

const clearHoverTimer = (): void => {
    if (hoverOpenTimer !== null) {
        clearTimeout(hoverOpenTimer);
        hoverOpenTimer = null;
    }
};

/**
 * 全局唯一的查词/划词短语浮层状态。
 *
 * 将 Floating UI、SWR 与 AI 流式订阅从成百上千个 `<Word>` 上提到单个宿主 `WordPopoverHost`，
 * 避免字幕/讲稿列表里每个单词都挂载重型交互 Hooks。
 */
export const useWordPopoverStore = create<WordPopoverState>((set, get) => ({
    open: false,
    mode: 'hover',
    target: null,

    scheduleHoverOpen: (target, delayMs = 90) => {
        clearHoverTimer();
        const state = get();
        // 点击或划词固定住浮层时，不因鼠标滑过其他词而被意外抢走焦点。
        if (state.open && state.mode !== 'hover' && state.target?.popKey !== target.popKey) {
            return;
        }
        hoverOpenTimer = setTimeout(() => {
            hoverOpenTimer = null;
            // 字幕切换/卸载后，已脱离文档的 DOM 节点 getBoundingClientRect() 会返回 (0,0,0,0)，不能再用它打开浮层。
            if (target.triggerEl && !target.triggerEl.isConnected) {
                return;
            }
            const latest = get();
            if (latest.open && latest.mode !== 'hover' && latest.target?.popKey !== target.popKey) {
                return;
            }
            set({ open: true, mode: 'hover', target });
        }, delayMs);
    },

    cancelHoverOpen: () => {
        clearHoverTimer();
    },

    openImmediately: (target, mode) => {
        clearHoverTimer();
        if (target.triggerEl && !target.triggerEl.isConnected && !target.anchorRect && !target.virtualRect) {
            return;
        }
        set({ open: true, mode, target });
    },

    closePopover: () => {
        clearHoverTimer();
        set({ open: false, target: null });
    },
}));
