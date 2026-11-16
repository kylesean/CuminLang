import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetSetting = vi.fn();
const mockTogglePlay = vi.fn();
const mockNextSentence = vi.fn();
const mockPrevSentence = vi.fn();

vi.mock('@/frontend/features/settings/settingsStore', () => ({
    default: (selector: (s: { values: Map<string, string>; setSetting: typeof mockSetSetting }) => unknown) => selector({
        values: new Map([
            ['shortcut.nextTheme', 't'],
            ['appearance.theme', 'light'],
            ['appearance.themeFamily', 'neutral'],
            ['shortcut.playPause', 'space'],
            ['shortcut.nextSentence', 'right'],
            ['shortcut.previousSentence', 'left'],
            ['shortcut.repeatSentence', 'down'],
            ['shortcut.repeatSingleSentence', 'r'],
            ['shortcut.autoPause', 'u'],
            ['shortcut.toggleEnglishDisplay', 'e'],
            ['shortcut.toggleChineseDisplay', 'c'],
            ['shortcut.toggleBilingualDisplay', 'b'],
            ['shortcut.adjustBeginMinus', 'z'],
            ['shortcut.adjustBeginPlus', 'x'],
            ['shortcut.adjustEndMinus', 'n'],
            ['shortcut.adjustEndPlus', 'm'],
            ['shortcut.clearAdjust', 'k'],
            ['shortcut.toggleWordLevelDisplay', 'l'],
            ['shortcut.nextPlaybackRate', 'p'],
            ['shortcut.volumeUp', 'up'],
            ['shortcut.volumeDown', 'alt+down'],
            ['shortcut.seekBackward', 'j'],
            ['shortcut.seekForward', 'l'],
            ['shortcut.openControlPanel', 'o'],
            ['shortcut.aiChat', '/'],
        ]),
        setSetting: mockSetSetting,
    }),
}));

vi.mock('@/frontend/features/player/playerStore', () => ({
    usePlayer: Object.assign(
        (selector: (s: Record<string, unknown>) => unknown) => selector({
            singleRepeat: false,
            autoPause: false,
        }),
        {
            getState: () => ({
                togglePlay: mockTogglePlay,
                nextSentence: mockNextSentence,
                prevSentence: mockPrevSentence,
                repeatCurrent: vi.fn(),
                setSingleRepeat: vi.fn(),
                setAutoPause: vi.fn(),
                adjustCurrentBegin: vi.fn(),
                adjustCurrentEnd: vi.fn(),
                clearAdjust: vi.fn(),
                cyclePlaybackRate: vi.fn(),
                setVolume: vi.fn(),
                seekTo: vi.fn(),
                volume: 1,
                duration: 100,
                internal: { exactPlayTime: 0 },
            }),
        },
    ),
}));

vi.mock('@/frontend/features/chat/chatStore', () => ({
    default: Object.assign(
        (selector: (s: { learningVisible: boolean }) => unknown) => selector({ learningVisible: false }),
        { getState: () => ({ learningVisible: false, createFromCurrent: vi.fn().mockResolvedValue(undefined) }) },
    ),
}));

vi.mock('@/frontend/features/practice/practiceStore', () => ({
    default: (selector: (s: { visible: boolean; recorderPhase: string }) => unknown) => selector({
        visible: false,
        recorderPhase: 'idle',
    }),
}));

vi.mock('@/frontend/app/stores/layoutStore', () => ({
    default: (selector: (s: { showSideBar: boolean; changeSideBar: () => void }) => unknown) => selector({
        showSideBar: false,
        changeSideBar: vi.fn(),
    }),
}));

vi.mock('@/frontend/features/player/lib/player-view-controller', () => ({
    exitOverlayView: vi.fn(),
}));

vi.mock('@/frontend/features/player/playerUiStore', () => ({
    usePlayerUi: (selector: (s: Record<string, unknown>) => unknown) => selector({
        changeShowEn: vi.fn(),
        changeShowCn: vi.fn(),
        changeShowEnCn: vi.fn(),
        changeShowWordLevel: vi.fn(),
    }),
}));

vi.mock('@/frontend/features/player/hooks/useSubtitleScroll', () => ({
    useSubtitleScrollState: (selector: (s: Record<string, unknown>) => unknown) => selector({
        onUserFinishScrolling: vi.fn(),
        scrollState: 'AUTO',
    }),
}));

import GlobalShortCut from '@/frontend/components/shared/shortcuts/GlobalShortCut';
import PlayerShortcut from '@/frontend/features/player/components/PlayerShortcut';

describe('快捷键录制与浮层隔离', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('存在快捷键录制面板 [data-shortcut-recorder="true"] 时，按 T 不翻转全局主题', () => {
        render(
            <>
                <GlobalShortCut />
                <button type="button" data-shortcut-recorder="true">
                    Press key
                </button>
            </>,
        );

        fireEvent.keyDown(document, { key: 't', code: 'KeyT' });
        expect(mockSetSetting).not.toHaveBeenCalled();
    });

    it('事件已被 defaultPrevented 或焦点在浮层/模态 dialog 内时，PlayerShortcut 不触发后台播放与跳句', () => {
        const { container } = render(
            <>
                <PlayerShortcut />
                <div role="dialog">
                    <button type="button">Reveal</button>
                </div>
                <div role="radiogroup">
                    <button type="button" role="radio" aria-checked="true">Option</button>
                </div>
            </>,
        );

        const dialogButton = container.querySelector('[role="dialog"] button') as HTMLButtonElement;
        dialogButton.focus();
        fireEvent.keyDown(dialogButton, { key: ' ', code: 'Space' });
        expect(mockTogglePlay).not.toHaveBeenCalled();

        // 模拟 TrainingMenuButton 仅调用 preventDefault() 拦截方向键
        const radio = container.querySelector('[role="radio"]') as HTMLButtonElement;
        radio.focus();
        const preventedEvent = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            code: 'ArrowRight',
            bubbles: true,
            cancelable: true,
        });
        preventedEvent.preventDefault();
        radio.dispatchEvent(preventedEvent);
        expect(mockNextSentence).not.toHaveBeenCalled();
    });
});
