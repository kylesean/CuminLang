import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import Word from '../word';
import { WordPopoverHost } from '../WordPopoverHost';
import { useWordPopoverStore } from '../wordPopoverStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'zh-CN' },
    }),
}));

vi.mock('@/frontend/infrastructure/audio/AudioPlayer', () => ({
    playWord: vi.fn(async () => undefined),
    getTtsUrl: vi.fn(async () => null),
    playAudioUrl: vi.fn(async () => undefined),
}));

vi.mock('@/frontend/features/settings/settingsApi', () => ({
    settingsApi: {
        listTtsVoices: vi.fn(async () => ({ selected: 'af_heart', voices: [] })),
    },
}));

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        translateWord: vi.fn(async ({ word }: { word: string }) => ({
            word,
            phonetic: '/test/',
            definitions: [{ partOfSpeech: 'verb', meaning: `meaning of ${word}`, examples: [] }],
            tags: [],
        })),
    },
}));

vi.mock('@/frontend/features/video-learning/videoLearningApi', () => ({
    videoLearningApi: {
        recordWordEncounter: vi.fn(async () => undefined),
        getWordMemory: vi.fn(async () => null),
        contextPack: vi.fn(async () => null),
        favoriteWord: vi.fn(async () => ({ success: true })),
        deleteWord: vi.fn(async () => ({ success: true })),
        updateWordState: vi.fn(async () => ({ success: true })),
    },
}));

const renderWithHost = (ui: React.ReactNode) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            {ui}
            <WordPopoverHost />
        </SWRConfig>,
    );

describe('Word + WordPopoverHost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useWordPopoverStore.getState().closePopover();
    });

    it('未激活时不挂载浮层、也不触发任何词典查询；点击单个单词才查词并展示释义', async () => {
        renderWithHost(
            <Word
                word="reluctant"
                original="reluctant"
                lemma="reluctant"
                sentenceText="He was reluctant to agree."
                sentenceIndex={0}
                sentenceHash="hash-1"
                popKey="hash-1:0:0"
                show={true}
            />,
        );

        expect(playerApi.translateWord).not.toHaveBeenCalled();
        expect(screen.queryByTestId('openai-word-pop-card')).toBeNull();

        fireEvent.click(screen.getByText('reluctant'));

        expect(await screen.findByText('meaning of reluctant')).toBeDefined();
        expect(playerApi.translateWord).toHaveBeenCalledTimes(1);
        expect(playerApi.translateWord).toHaveBeenCalledWith(expect.objectContaining({
            word: 'reluctant',
            context: 'He was reluctant to agree.',
        }));
    });

    it('同一句内划词选中多个连续单词时自动组合为词组浮层并查词', async () => {
        renderWithHost(
            <p>
                <Word
                    word="make"
                    original="make"
                    lemma="make"
                    sentenceText="Please make sure it works."
                    sentenceIndex={3}
                    sentenceHash="hash-2"
                    popKey="hash-2:3:1"
                    show={true}
                />{' '}
                <Word
                    word="sure"
                    original="sure"
                    lemma="sure"
                    sentenceText="Please make sure it works."
                    sentenceIndex={3}
                    sentenceHash="hash-2"
                    popKey="hash-2:3:2"
                    show={true}
                />
            </p>,
        );

        const firstWord = screen.getByText('make');
        const secondWord = screen.getByText('sure');
        const firstTextNode = firstWord.firstChild!;
        const secondTextNode = secondWord.firstChild!;

        const range = document.createRange();
        range.setStart(firstTextNode, 0);
        range.setEnd(secondTextNode, 4);
        range.getBoundingClientRect = () => new DOMRect(10, 20, 80, 18);

        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        fireEvent.mouseUp(document);

        expect(await screen.findByText('meaning of make sure')).toBeDefined();
        expect(playerApi.translateWord).toHaveBeenCalledWith(expect.objectContaining({
            word: 'make sure',
            context: 'Please make sure it works.',
        }));
        expect(videoLearningApi.getWordMemory).toHaveBeenCalledWith('make sure');
    });

    it('悬停延迟期间触发节点已从 DOM 卸载时，不得在 (0,0) 处打开浮层', () => {
        vi.useFakeTimers();
        try {
            const { unmount } = renderWithHost(
                <Word
                    word="talk"
                    original="talk"
                    lemma="talk"
                    sentenceText="Let us talk later."
                    sentenceIndex={1}
                    sentenceHash="hash-talk"
                    popKey="hash-talk:1:2"
                    show={true}
                />,
            );

            fireEvent.mouseEnter(screen.getByText('talk'));
            // 字幕切换导致原词节点在 90ms 延迟触发前被卸载
            unmount();
            vi.advanceTimersByTime(120);

            expect(useWordPopoverStore.getState().open).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('点击打开单词卡后即使原字幕节点随后卸载，浮层仍锚定在最后已知位置而不会跳到左上角', async () => {
        const { unmount } = render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <Word
                    word="talk"
                    original="talk"
                    lemma="talk"
                    sentenceText="Let us talk later."
                    sentenceIndex={1}
                    sentenceHash="hash-talk"
                    popKey="hash-talk:1:2"
                    show={true}
                />
            </SWRConfig>,
        );

        const hostResult = render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <WordPopoverHost />
            </SWRConfig>,
        );

        const wordSpan = screen.getByText('talk').closest('[data-word="true"]') as HTMLElement;
        wordSpan.getBoundingClientRect = () => new DOMRect(420, 720, 48, 28);

        fireEvent.click(wordSpan);
        expect(await hostResult.findByText('meaning of talk')).toBeDefined();

        // 模拟字幕推进：旧句中的 <Word> 卸载，但若不降级到已记录的 anchorRect，getBoundingClientRect 会变成 (0,0,0,0)
        unmount();
        wordSpan.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);

        // 触发重新布局后，浮层改由快照矩形锚定，不会因 detached 节点退化到左上角 (8px, 8px)
        fireEvent(window, new Event('resize'));

        await waitFor(() => {
            const floatingWrapper = hostResult.getByLabelText('talk');
            expect(floatingWrapper.style.transform).toContain('712px');
        });
        const styleAttr = hostResult.getByLabelText('talk').getAttribute('style') ?? '';
        expect(styleAttr).not.toMatch(/translate(?:3d)?\(8px,\s*8px/);
    });
});
