import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayer } from '@/frontend/features/player/playerStore';
import { deriveSentenceEndMode } from '@/frontend/features/player/lib/sentence-end-mode';

// playerStore 在模块加载时会拉取设置与窗口信息；这里只关心句末模式的状态转移，
// 把外部 IPC 与音频能力全部替身掉，避免测试依赖真实后端。
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

/** 读取当前句末模式的四个字段快照。 */
const snapshot = () => {
    const s = usePlayer.getState();
    return {
        autoPause: s.autoPause,
        singleRepeat: s.singleRepeat,
        shadowing: s.shadowing,
        sentenceLoop: s.sentenceLoop !== null,
    };
};

/** 当前同时启用的模式数量，用于断言互斥不变量。 */
const enabledCount = (): number => {
    const s = snapshot();
    return [s.autoPause, s.singleRepeat, s.shadowing, s.sentenceLoop].filter(Boolean).length;
};

describe('playerStore 句末模式互斥', () => {
    beforeEach(() => {
        usePlayer.setState({
            autoPause: false,
            singleRepeat: false,
            shadowing: false,
            hoverRepeat: false,
            sentenceLoop: null,
            playbackRate: 1,
        });
    });

    it('开启自动暂停会关闭单句循环与影子跟读', () => {
        usePlayer.getState().setSingleRepeat(true);
        usePlayer.getState().setAutoPause(true);

        expect(snapshot()).toEqual({
            autoPause: true,
            singleRepeat: false,
            shadowing: false,
            sentenceLoop: false,
        });
        expect(enabledCount()).toBe(1);
    });

    it('开启影子跟读会关闭自动暂停与单句循环', () => {
        usePlayer.getState().setAutoPause(true);
        usePlayer.getState().setShadowing(true);

        expect(snapshot()).toEqual({
            autoPause: false,
            singleRepeat: false,
            shadowing: true,
            sentenceLoop: false,
        });
        expect(enabledCount()).toBe(1);
    });

    it('开启逐句循环会关闭全部布尔模式', () => {
        usePlayer.getState().setSingleRepeat(true);
        usePlayer.getState().setSentenceLoop({ times: 3 });

        expect(snapshot()).toEqual({
            autoPause: false,
            singleRepeat: false,
            shadowing: false,
            sentenceLoop: true,
        });
        expect(enabledCount()).toBe(1);
    });

    it('切换持久模式会取消悬停临时循环（显式选择优先）', () => {
        usePlayer.getState().setHoverRepeat(true);
        expect(usePlayer.getState().hoverRepeat).toBe(true);

        usePlayer.getState().setAutoPause(true);
        expect(usePlayer.getState().hoverRepeat).toBe(false);
    });

    it('repeatCurrent 的单句循环分支同样遵守互斥', () => {
        usePlayer.getState().setShadowing(true);
        // loop 分支过去直接 set({ singleRepeat: true })，会与影子跟读并存
        usePlayer.getState().repeatCurrent({ loop: true });

        expect(snapshot()).toEqual({
            autoPause: false,
            singleRepeat: true,
            shadowing: false,
            sentenceLoop: false,
        });
        expect(enabledCount()).toBe(1);
    });

    it('关闭某个模式不会顺手打开别的模式', () => {
        usePlayer.getState().setAutoPause(true);
        usePlayer.getState().setAutoPause(false);

        expect(enabledCount()).toBe(0);
    });

    it('UI 派生模式与 store 实际生效的字段一致（脏状态下也成立）', () => {
        // 这条钉的是「两个文件之间的顺序对齐」：`deriveSentenceEndMode` 的裁决顺序
        // 必须与 `onTimeUpdate` 的分支顺序一致，否则 UI 会显示一个引擎不执行的模式。
        //
        // 正常路径（互斥由 setter 保证）逐个验证：
        const cases: Array<[() => void, string]> = [
            [() => usePlayer.getState().setAutoPause(true), 'autoPause'],
            [() => usePlayer.getState().setSingleRepeat(true), 'singleRepeat'],
            [() => usePlayer.getState().setShadowing(true), 'shadowing'],
            [() => usePlayer.getState().setSentenceLoop({ times: 3 }), 'sentenceLoop'],
        ];
        for (const [activate, expected] of cases) {
            usePlayer.setState({
                autoPause: false,
                singleRepeat: false,
                shadowing: false,
                sentenceLoop: null,
            });
            activate();
            const s = usePlayer.getState();
            expect(
                deriveSentenceEndMode(
                    { autoPause: s.autoPause, singleRepeat: s.singleRepeat, shadowing: s.shadowing },
                    s.sentenceLoop !== null,
                ),
                expected,
            ).toBe(expected);
        }

        // 脏状态（绕过 setter 直接写字段）：引擎会先命中 autoPause 分支，UI 必须同样显示 autoPause
        usePlayer.setState({ autoPause: true, singleRepeat: true, shadowing: true, sentenceLoop: null });
        const dirty = usePlayer.getState();
        expect(
            deriveSentenceEndMode(
                { autoPause: dirty.autoPause, singleRepeat: dirty.singleRepeat, shadowing: dirty.shadowing },
                dirty.sentenceLoop !== null,
            ),
        ).toBe('autoPause');
    });

    it('影子跟读在多行合并意群块内不在首行中途停顿，直到整句块结尾才留白', () => {
        vi.useFakeTimers();
        try {
            const s0 = {
                fileHash: 'hash-block',
                index: 0,
                start: 1,
                end: 2.5,
                adjustedStart: null,
                adjustedEnd: null,
                text: 'When you speak',
                textZH: '',
                key: 'hash-block-0',
                transGroup: 1,
                translationKey: 'hash-block:0',
                struct: { original: 'When you speak', blocks: [] },
            };
            const s1 = {
                fileHash: 'hash-block',
                index: 1,
                start: 2.7,
                end: 4.5,
                adjustedStart: null,
                adjustedEnd: null,
                text: 'people listen closely.',
                textZH: '',
                key: 'hash-block-1',
                transGroup: 1,
                translationKey: 'hash-block:1',
                struct: { original: 'people listen closely.', blocks: [] },
            };
            usePlayer.getState().setSource('file:///block.mp4');
            usePlayer.getState().loadSubtitles([s0, s1]);
            usePlayer.getState().setShadowing(true);
            usePlayer.getState().gotoSentence(s0);
            usePlayer.getState().play();
            usePlayer.getState().resolveSeek(1.0);

            // 越过第一行句尾 2.5s 但仍在合并块 [1.0, 4.5] 内：不应提前停顿
            usePlayer.getState().updateExactPlayTime(2.6);
            expect(usePlayer.getState().shadowingPause).toBeNull();
            expect(usePlayer.getState().playing).toBe(true);

            // 越过整句块结尾 4.5s：触发留白倒计时并暂停
            usePlayer.getState().updateExactPlayTime(4.6);
            expect(usePlayer.getState().shadowingPause).not.toBeNull();
            expect(usePlayer.getState().playing).toBe(false);
        } finally {
            usePlayer.getState().setShadowing(false);
            vi.useRealTimers();
        }
    });
});
