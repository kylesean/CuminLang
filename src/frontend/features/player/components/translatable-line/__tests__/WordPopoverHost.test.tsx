import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
