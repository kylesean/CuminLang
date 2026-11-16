import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import Word from '../word';
import { WordPopoverHost } from '../WordPopoverHost';
import { useWordPopoverStore } from '../wordPopoverStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';
import useSetting from '@/frontend/features/settings/settingsStore';

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

    it('划词首尾落在标点/空格、拖选单个词或跨合并句折行时都能正常弹出词卡，卡片内复制划选不误触发', async () => {
        renderWithHost(
            <span data-sentence-unit="u-1" data-sentence-unit-text="Please make sure.">
                <span>
                    <Word
                        word="make"
                        original="make"
                        lemma="make"
                        sentenceText="Please make"
                        sentenceIndex={0}
                        sentenceHash="hash-u:0"
                        popKey="hash-u:0:0"
                        show={true}
                    />{' '}
                </span>
                <span>
                    <Word
                        word="sure"
                        original="sure"
                        lemma="sure"
                        sentenceText="sure."
                        sentenceIndex={1}
                        sentenceHash="hash-u:1"
                        popKey="hash-u:1:0"
                        show={true}
                    />
                    <span>.</span>
                </span>
            </span>,
        );

        const firstWord = screen.getByText('make');
        const punct = screen.getByText('.');

        // 1) 起点在词内、终点落在词尾句号上（跨了句行与标点）
        const phraseRange = document.createRange();
        phraseRange.setStart(firstWord.firstChild!, 0);
        phraseRange.setEnd(punct.firstChild!, 1);
        phraseRange.getBoundingClientRect = () => new DOMRect(12, 24, 90, 18);

        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(phraseRange);
        fireEvent.mouseUp(document);

        expect(await screen.findByText('meaning of make sure')).toBeDefined();
        expect(playerApi.translateWord).toHaveBeenCalledWith(expect.objectContaining({
            word: 'make sure',
            context: 'Please make sure.',
        }));

        // 关闭按钮可直接关闭词卡
        fireEvent.click(screen.getByRole('button', { name: 'close' }));
        expect(useWordPopoverStore.getState().open).toBe(false);

        // 2) 拖拽选中单个单词时不再与 onClick 互相让路失效
        const singleRange = document.createRange();
        singleRange.setStart(firstWord.firstChild!, 0);
        singleRange.setEnd(firstWord.firstChild!, 4);
        singleRange.getBoundingClientRect = () => new DOMRect(12, 24, 40, 18);
        selection.removeAllRanges();
        selection.addRange(singleRange);
        fireEvent.mouseUp(document);

        expect(await screen.findByText('meaning of make')).toBeDefined();

        // 3) 在卡片正文内部划选文字不会触发新的查词弹窗
        const meaningNode = screen.getByText('meaning of make');
        const insideRange = document.createRange();
        insideRange.setStart(meaningNode.firstChild!, 0);
        insideRange.setEnd(meaningNode.firstChild!, 5);
        insideRange.getBoundingClientRect = () => new DOMRect(20, 40, 30, 14);
        selection.removeAllRanges();
        selection.addRange(insideRange);
        const callCountBefore = vi.mocked(playerApi.translateWord).mock.calls.length;
        fireEvent.mouseUp(document);
        expect(vi.mocked(playerApi.translateWord).mock.calls.length).toBe(callCountBefore);
    });

    it('未命中任何词典返回 null 时仍保留词头、收藏与关闭按钮，不再只展示光秃秃的暂无释义', async () => {
        vi.mocked(playerApi.translateWord).mockResolvedValueOnce(null);
        renderWithHost(
            <Word
                word="unmatchedphrase"
                original="unmatchedphrase"
                sentenceText="An unmatchedphrase here."
                sentenceIndex={2}
                sentenceHash="hash-3"
                popKey="hash-3:2:0"
                show={true}
            />,
        );

        fireEvent.click(screen.getByText('unmatchedphrase'));
        expect(await screen.findByText('noDefinition')).toBeDefined();
        expect(screen.getByLabelText('unmatchedphrase')).toBeDefined();
        expect(screen.getByRole('button', { name: 'favoriteWord' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'close' })).toBeDefined();
    });

    it('悬停打开的词卡在点击 AI 解释后自动固定为 click 态且失败时不抹掉已有释义', async () => {
        useSetting.setState({ values: new Map([['providers.dictionary', 'openai']]) });
        renderWithHost(
            <Word
                word="insight"
                original="insight"
                sentenceText="That is a sharp insight."
                sentenceIndex={4}
                sentenceHash="hash-4"
                popKey="hash-4:4:0"
                show={true}
            />,
        );

        const targetSpan = screen.getByText('insight').closest('[data-word="true"]') as HTMLElement;
        vi.useFakeTimers();
        fireEvent.mouseEnter(targetSpan);
        vi.advanceTimersByTime(100);
        vi.useRealTimers();

        expect(await screen.findByText('meaning of insight')).toBeDefined();
        expect(useWordPopoverStore.getState().mode).toBe('hover');

        // 模拟 AI 刷新失败（返回 null）：卡片内按下后 mode 立即锁定为 click，且原词典释义不被抹空
        vi.mocked(playerApi.translateWord).mockResolvedValueOnce(null as never);
        const aiBtn = screen.getByRole('button', { name: 'aiDictionary' });
        fireEvent.pointerDown(aiBtn);
        fireEvent.mouseDown(aiBtn);
        fireEvent.click(aiBtn);

        await waitFor(() => {
            expect(playerApi.translateWord).toHaveBeenCalledWith(expect.objectContaining({
                word: 'insight',
                forceRefresh: true,
            }));
        });
        expect(useWordPopoverStore.getState().open).toBe(true);
        expect(useWordPopoverStore.getState().mode).toBe('click');
        expect(screen.getByText('meaning of insight')).toBeDefined();
    });
});
