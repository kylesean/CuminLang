import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sentence } from '@/common/types/SentenceC';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { useTrainingModeStore } from '@/frontend/features/player/trainingStore';

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        deleteTimestampAdjustmentByKey: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/frontend/infrastructure/electron/backendClient', () => ({
    backendClient: { call: vi.fn().mockResolvedValue({}) },
}));

vi.mock('@/frontend/log/simple-logger', () => ({
    getRendererLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const makeSentence = (index: number, start: number, end: number): Sentence => ({
    fileHash: 'hash-last',
    index,
    start,
    end,
    adjustedStart: null,
    adjustedEnd: null,
    text: `Sentence ${index}`,
    textZH: '',
    key: `hash-last-${index}`,
    transGroup: 1,
    translationKey: `hash-last:${index}`,
    struct: { original: `Sentence ${index}`, blocks: [] },
});

// 两条字幕间隔必须 ≥ 0.8s（MAX_GAP_SECONDS），否则会被归并进同一意群块，
// 循环计划的锚点就变成块首句而不是末句。
const SENTENCES = [
    makeSentence(0, 1, 3),
    makeSentence(1, 3.9, 6),
];

/**
 * 回归背景：getByTime 对首尾做了钳制，越过末句的采样永远返回末句本身，
 * 「进入下一句再续开计划」的判定在最后一句永不成立——completed 计划会永久滞留，
 * 拦截全部句末模式（逐句循环/单句循环/自动暂停/影子跟读）直到用户手动逃逸。
 * 现在播放头越过锚点句末 +0.2s 缓冲即视为空隙已过，为末句续开新一轮。
 */
describe('playerStore 逐句循环在末句的 completed 逃逸', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useTrainingModeStore.setState({ skipGap: false });
        // store 是模块级单例：上一条测试遗留的句末模式必须清掉（setSource 有意保留模式）
        usePlayer.setState({
            autoPause: false,
            singleRepeat: false,
            shadowing: false,
            hoverRepeat: false,
            sentenceLoop: null,
        });
        usePlayer.getState().setSource('file:///test.mp4');
        usePlayer.getState().loadSubtitles(SENTENCES);
        usePlayer.setState({ playbackRate: 1.0 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('末句播完两遍后越过句末，计划续开新一轮而不是永久滞留', () => {
        const s1 = usePlayer.getState().sentences[1];

        // 锚定末句开启逐句循环 ×2
        usePlayer.getState().seekToTarget({ time: 4.0, target: s1 });
        usePlayer.getState().setSentenceLoop({ times: 2 });
        usePlayer.getState().resolveSeek(3.9);
        let plan = usePlayer.getState().internal.transientPlan;
        expect(plan?.anchorKey).toBe('hash-last-1');

        // 第 1 遍播完（lead=0.06s，5.96 已越过判定线）→ seek 回句首
        usePlayer.getState().updateExactPlayTime(5.96);
        vi.runAllTimers();
        plan = usePlayer.getState().internal.transientPlan;
        expect(plan?.loopDone).toBe(1);

        // 第 2 遍播完 → 不跳空隙 → 进入 completed 等待空隙
        usePlayer.getState().resolveSeek(3.9);
        usePlayer.getState().updateExactPlayTime(5.96);
        vi.runAllTimers();
        plan = usePlayer.getState().internal.transientPlan;
        expect(plan?.completed).toBe(true);

        // 播放头越过末句句末（getByTime 钳制仍返回末句本身）：修复前在此永久滞留
        usePlayer.getState().updateExactPlayTime(6.3);
        vi.runAllTimers();
        plan = usePlayer.getState().internal.transientPlan;
        expect(plan).not.toBeNull();
        expect(plan?.completed).toBeFalsy();
        expect(plan?.loopDone).toBe(0);
        // 续开动作以 seek 回句首开始
        expect(usePlayer.getState().internal.seekInFlight).toBe(true);
    });

    it('一次性计划（未开启逐句循环）在末句越过句末后正常清除', () => {
        const s1 = usePlayer.getState().sentences[1];

        usePlayer.getState().seekToTarget({ time: 4.0, target: s1 });
        // 直接构造一次性两遍计划（repeatCurrent 语义）
        usePlayer.getState().repeatCurrent({ loop: false, play: true });
        usePlayer.getState().resolveSeek(3.9);
        usePlayer.getState().updateExactPlayTime(5.96);
        vi.runAllTimers();
        // 单遍计划：第一遍结束即清计划并恢复倍速（无 sentenceLoop 时不滞留）
        expect(usePlayer.getState().internal.transientPlan).toBeNull();
    });

    it('中间句开启每句重复 ×3 且不跳过空隙时，3 遍完成后在句间空隙不原地重开，进入下一句后才切到下一句', () => {
        const s0 = usePlayer.getState().sentences[0]; // [1, 3]
        const s1 = usePlayer.getState().sentences[1]; // [3.9, 6]

        usePlayer.getState().seekToTarget({ time: 1.0, target: s0 });
        usePlayer.getState().setSentenceLoop({ times: 3 });
        usePlayer.getState().resolveSeek(1.0);

        // 第 1 遍 & 第 2 遍在句末回跳
        usePlayer.getState().updateExactPlayTime(2.96);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.loopDone).toBe(1);

        usePlayer.getState().resolveSeek(1.0);
        usePlayer.getState().updateExactPlayTime(2.96);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.loopDone).toBe(2);

        // 第 3 遍播完：标记 completed，等待 3.0 -> 3.9s 句间空隙自然播过
        usePlayer.getState().resolveSeek(1.0);
        usePlayer.getState().updateExactPlayTime(2.96);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.completed).toBe(true);

        // 在空隙中（3.3s，已过 3.0+0.2s 但尚未到 3.9s 下一句）：绝对不能重开 s0
        usePlayer.getState().updateExactPlayTime(3.3);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.completed).toBe(true);
        expect(usePlayer.getState().internal.transientPlan?.anchorKey).toBe(s0.key);
        expect(usePlayer.getState().internal.seekInFlight).toBe(false);

        // 自然进入下一句 s1（3.92s）：切到 s1 并开启新一轮 1/3
        usePlayer.getState().updateExactPlayTime(3.92);
        vi.runAllTimers();
        expect(usePlayer.getState().currentSentence?.key).toBe(s1.key);
        expect(usePlayer.getState().internal.transientPlan?.anchorKey).toBe(s1.key);
        expect(usePlayer.getState().internal.transientPlan?.completed).toBeFalsy();
        expect(usePlayer.getState().internal.transientPlan?.loopDone).toBe(0);
    });

    it('多行合并意群块开启每句重复 ×3 后，不因末尾落在块内末行而无限重复同一块', () => {
        const blockSentences = [
            makeSentence(0, 1.0, 2.5),
            makeSentence(1, 2.7, 4.5), // 与句 0 间隔 0.2s (<0.8s)，合并为同一意群块
            makeSentence(2, 5.5, 8.0), // 下一独立句
        ];
        usePlayer.getState().loadSubtitles(blockSentences);

        const b0Head = usePlayer.getState().sentences[0];
        const b1 = usePlayer.getState().sentences[2];

        usePlayer.getState().seekToTarget({ time: 1.0, target: b0Head });
        usePlayer.getState().setSentenceLoop({ times: 3 });
        usePlayer.getState().resolveSeek(1.0);

        usePlayer.getState().updateExactPlayTime(4.46);
        vi.runAllTimers();
        usePlayer.getState().resolveSeek(1.0);
        usePlayer.getState().updateExactPlayTime(4.46);
        vi.runAllTimers();
        usePlayer.getState().resolveSeek(1.0);
        usePlayer.getState().updateExactPlayTime(4.46);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.completed).toBe(true);

        // 4.47s 仍落在意群块第二行但尚未到句 2（5.5s）：不能原地重开同一块
        usePlayer.getState().updateExactPlayTime(4.47);
        vi.runAllTimers();
        expect(usePlayer.getState().internal.transientPlan?.completed).toBe(true);
        expect(usePlayer.getState().internal.transientPlan?.anchorKey).toBe(b0Head.key);

        // 5.52s 进入下一句：正常推进到 b1
        usePlayer.getState().updateExactPlayTime(5.52);
        vi.runAllTimers();
        expect(usePlayer.getState().currentSentence?.key).toBe(b1.key);
        expect(usePlayer.getState().internal.transientPlan?.anchorKey).toBe(b1.key);
        expect(usePlayer.getState().internal.transientPlan?.completed).toBeFalsy();
        expect(usePlayer.getState().internal.transientPlan?.loopDone).toBe(0);
    });
});
