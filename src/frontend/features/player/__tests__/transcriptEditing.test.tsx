import { fireEvent, render, renderHook, act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sentence } from '@/common/types/SentenceC';

const {
    mockTogglePlay,
    mockLoadSubtitles,
    mockSaveEditedSubtitle,
    mockSetActiveFileHash,
    mockRequestTranslation,
    mockLoadSavedForVideo,
    stateBox,
} = vi.hoisted(() => ({
    mockTogglePlay: vi.fn(),
    mockLoadSubtitles: vi.fn(),
    mockSaveEditedSubtitle: vi.fn(),
    mockSetActiveFileHash: vi.fn(),
    mockRequestTranslation: vi.fn(),
    mockLoadSavedForVideo: vi.fn(async () => undefined),
    stateBox: { sentences: [] as Sentence[] },
}));

vi.mock('react-hot-toast', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/frontend/features/settings/settingsStore', () => ({
    default: (selector: (s: { values: Map<string, string> }) => unknown) => selector({
        values: new Map([
            ['appearance.fontSize', 'fontSizeMedium'],
            ['shortcut.playPause', 'space'],
            ['shortcut.nextTheme', 't'],
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
    }),
}));

vi.mock('@/frontend/features/player/hooks/useSubtitleScroll', () => ({
    useSubtitleScrollState: (selector: (s: Record<string, unknown>) => unknown) => selector({
        onUserFinishScrolling: vi.fn(),
        scrollState: 'AUTO',
    }),
}));

vi.mock('@/frontend/features/chat/chatStore', () => ({
    default: Object.assign(
        (selector: (s: { learningVisible: boolean }) => unknown) => selector({ learningVisible: false }),
        { getState: () => ({ learningVisible: false, createFromCurrent: vi.fn() }) },
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
    usePlayerUiState: (selector: (s: { showSideTranslation: boolean }) => unknown) => selector({
        showSideTranslation: false,
    }),
}));

vi.mock('@/frontend/features/context-studio/savedSentencesStore', () => ({
    useSavedSentences: Object.assign(
        (selector: (s: { savedKeys: Set<string>; toggleSentence: () => Promise<boolean> }) => unknown) => selector({
            savedKeys: new Set(),
            toggleSentence: vi.fn(async () => true),
        }),
        {
            getState: () => ({ loadForVideo: mockLoadSavedForVideo }),
        },
    ),
}));

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        saveEditedSubtitle: mockSaveEditedSubtitle,
    },
}));

vi.mock('@/frontend/features/player/translationStore', () => ({
    default: Object.assign(
        (selector: (s: { translations: Map<string, string> }) => unknown) => selector({ translations: new Map() }),
        {
            getState: () => ({
                translations: new Map(),
                setActiveFileHash: mockSetActiveFileHash,
                requestTranslation: mockRequestTranslation,
            }),
        },
    ),
}));

vi.mock('@/frontend/features/player/playerStore', () => ({
    usePlayer: Object.assign(
        (selector: (s: Record<string, unknown>) => unknown) => selector({
            playing: false,
            singleRepeat: false,
            autoPause: false,
        }),
        {
            getState: () => ({
                sentences: stateBox.sentences,
                loadSubtitles: (next: Sentence[]) => {
                    stateBox.sentences = next;
                    mockLoadSubtitles(next);
                },
                clearVirtualGroup: vi.fn(),
                togglePlay: mockTogglePlay,
                nextSentence: vi.fn(),
                prevSentence: vi.fn(),
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

import PlayerShortcut from '@/frontend/features/player/components/PlayerShortcut';
import SideSentence from '@/frontend/features/player/components/srt-layout/SideSentence';
import { TranscriptToolbar } from '@/frontend/features/player/components/srt-layout/components/TranscriptToolbar';
import { useTranscriptEditing } from '@/frontend/features/player/hooks/useTranscriptEditing';
import {
    mergeSentenceWithNext,
    replaceSentenceText,
    splitSentenceAtCursor,
} from '@/frontend/features/player/lib/transcript-edit-ops';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';

const sampleSentence = (index: number, start: number, end: number, text: string): Sentence => ({
    fileHash: 'hash-1',
    index,
    start,
    end,
    adjustedStart: null,
    adjustedEnd: null,
    text,
    textZH: '',
    key: `hash-1:${index}`,
    transGroup: 1,
    translationKey: `hash-1:${index}`,
    struct: { original: text, blocks: [] },
});

describe('transcript-edit-ops', () => {
    const sentences = [
        sampleSentence(0, 1.0, 5.0, 'First part Second part'),
        sampleSentence(1, 5.2, 8.0, 'Third line'),
    ];

    it('replaces text on unchanged lines cleanly and returns null when empty or identical', () => {
        expect(replaceSentenceText(sentences, 0, 'First part Second part')).toBeNull();
        expect(replaceSentenceText(sentences, 0, '   ')).toBeNull();
        const updated = replaceSentenceText(sentences, 0, 'Updated first sentence');
        expect(updated).toEqual([
            expect.objectContaining({ start: 1.0, end: 5.0, contentEn: 'Updated first sentence' }),
            expect.objectContaining({ start: 5.2, end: 8.0, contentEn: 'Third line' }),
        ]);
    });

    it('splits at cursor proportionally and guards edge offsets', () => {
        expect(splitSentenceAtCursor(sentences, 0, 'First part Second part', 0)).toBeNull();
        const split = splitSentenceAtCursor(sentences, 0, 'First part Second part', 11);
        expect(split).toHaveLength(3);
        expect(split![0].contentEn).toBe('First part');
        expect(split![1].contentEn).toBe('Second part');
        expect(split![0].end).toBe(split![1].start);
        expect(split![0].end).toBeGreaterThan(1.2);
        expect(split![0].end).toBeLessThan(4.8);
    });

    it('merges target sentence (including unsaved draft) with next line', () => {
        expect(mergeSentenceWithNext(sentences, 1)).toBeNull();
        const merged = mergeSentenceWithNext(sentences, 0, 'Edited start');
        expect(merged).toEqual([
            expect.objectContaining({ start: 1.0, end: 8.0, contentEn: 'Edited start Third line' }),
        ]);
    });
});

describe('SideSentence inline edit & shortcut isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        usePlaybackSession.getState().clear();
    });

    it('isolates global playback shortcuts while editing and commits on Enter', () => {
        const sentence = sampleSentence(0, 1, 4, 'Original text');
        const onCommitEdit = vi.fn();
        const onCancelEdit = vi.fn();
        const onSplitAtCursor = vi.fn();
        const onMergeNext = vi.fn();

        render(
            <>
                <PlayerShortcut />
                <SideSentence
                    sentence={sentence}
                    onClick={vi.fn()}
                    isCurrent={false}
                    isRepeat={false}
                    isEditing
                    canMergeNext
                    onCancelEdit={onCancelEdit}
                    onCommitEdit={onCommitEdit}
                    onSplitAtCursor={onSplitAtCursor}
                    onMergeNext={onMergeNext}
                />
            </>,
        );

        const editor = screen.getByTestId('side-sentence-inline-editor') as HTMLTextAreaElement;
        expect(document.activeElement).toBe(editor);

        fireEvent.keyDown(editor, { key: ' ', code: 'Space' });
        expect(mockTogglePlay).not.toHaveBeenCalled();

        fireEvent.change(editor, { target: { value: 'Corrected subtitle', selectionStart: 9 } });
        fireEvent.select(editor, { target: { selectionStart: 9 } });
        fireEvent.click(screen.getByTestId('side-sentence-split'));
        expect(onSplitAtCursor).toHaveBeenCalledWith(sentence, 'Corrected subtitle', 9);

        fireEvent.click(screen.getByTestId('side-sentence-merge-next'));
        expect(onMergeNext).toHaveBeenCalledWith(sentence, 'Corrected subtitle');

        fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' });
        expect(onCommitEdit).toHaveBeenCalledWith(sentence, 'Corrected subtitle');

        fireEvent.keyDown(editor, { key: 'Escape', code: 'Escape' });
        expect(onCancelEdit).toHaveBeenCalledTimes(1);
    });

    it('marks saved .edited.srt hash as preloaded so bridge skips clearSubtitles flicker', () => {
        usePlaybackSession.getState().applySavedEditedSubtitle(
            '/media/talk.edited.srt',
            'new-hash-l3',
            {
                subtitlePath: '/media/talk.edited.srt',
                mismatchSuspected: false,
                origin: 'user_edited',
                tracks: [{ path: '/media/talk.edited.srt', fileName: 'talk.edited.srt', origin: 'user_edited', active: true }],
            },
        );

        const state = usePlaybackSession.getState();
        expect(state.subtitlePath).toBe('/media/talk.edited.srt');
        expect(state.srtHash).toBe('new-hash-l3');
        expect(state.preloadedHash).toBe('new-hash-l3');
        expect(state.subtitleOrigin).toBe('user_edited');
    });

    it('persists inline edits via useTranscriptEditing, syncs player & translation stores, and supports undo', async () => {
        const original = sampleSentence(0, 1, 4, 'Initial text');
        const edited = { ...sampleSentence(0, 1, 4, 'Edited text'), fileHash: 'hash-l3', key: 'hash-l3:0', translationKey: 'hash-l3:0' };
        const reverted = { ...original, fileHash: 'hash-undo', key: 'hash-undo:0', translationKey: 'hash-undo:0' };

        stateBox.sentences = [original];
        usePlaybackSession.setState({
            videoId: 'video-1',
            videoPath: '/media/talk.mp4',
            subtitlePath: '/media/talk.en.srt',
            srtHash: 'hash-1',
        });

        mockSaveEditedSubtitle
            .mockResolvedValueOnce({
                srt: { fileHash: 'hash-l3', filePath: '/media/talk.edited.srt', sentences: [edited] },
                resolution: {
                    subtitlePath: '/media/talk.edited.srt',
                    mismatchSuspected: false,
                    origin: 'user_edited',
                    tracks: [],
                },
            })
            .mockResolvedValueOnce({
                srt: { fileHash: 'hash-undo', filePath: '/media/talk.edited.srt', sentences: [reverted] },
                resolution: null,
            });

        const { result } = renderHook(() => useTranscriptEditing());

        await act(async () => {
            await result.current.commitEdit(original, 'Edited text');
        });

        expect(mockSaveEditedSubtitle).toHaveBeenCalledWith(expect.objectContaining({
            videoId: 'video-1',
            videoPath: '/media/talk.mp4',
            sourceSubtitlePath: '/media/talk.en.srt',
            oldFileHash: 'hash-1',
            lines: [expect.objectContaining({ contentEn: 'Edited text' })],
        }));
        expect(mockLoadSubtitles).toHaveBeenCalledWith([edited]);
        expect(mockSetActiveFileHash).toHaveBeenCalledWith('hash-l3');
        expect(mockRequestTranslation).toHaveBeenCalledWith('hash-l3', 0);
        expect(mockLoadSavedForVideo).toHaveBeenCalledWith('video-1');
        expect(result.current.canUndo).toBe(true);

        await act(async () => {
            await result.current.undoLastEdit();
        });

        expect(mockSaveEditedSubtitle).toHaveBeenCalledTimes(2);
        expect(mockLoadSubtitles).toHaveBeenLastCalledWith([reverted]);
        expect(result.current.canUndo).toBe(false);
    });

    it('surfaces visible Undo button in TranscriptToolbar only when canUndoEdit is true', () => {
        const onUndoEdit = vi.fn();
        const baseProps = {
            transcriptViewMode: 'sentence' as const,
            onChangeViewMode: vi.fn(),
            loopSentenceCount: 0,
            onCancelLoop: vi.fn(),
            isSearchOpen: false,
            onToggleSearch: vi.fn(),
            vocabularyFilter: 'all' as const,
            onChangeVocabularyFilter: vi.fn(),
            filterCounts: { all: 5, learning: 2, familiar: 3 },
            showSideTranslation: false,
            onToggleSideTranslation: vi.fn(),
            transcriptPosition: 'right' as const,
            onToggleTranscriptPosition: vi.fn(),
            onCloseTranscript: vi.fn(),
            onUndoEdit,
        };

        const { rerender } = render(<TranscriptToolbar {...baseProps} canUndoEdit={false} />);
        expect(screen.queryByTestId('transcript-undo-edit')).toBeNull();

        rerender(<TranscriptToolbar {...baseProps} canUndoEdit={true} />);
        const undoButton = screen.getByTestId('transcript-undo-edit');
        fireEvent.click(undoButton);
        expect(onUndoEdit).toHaveBeenCalledTimes(1);
    });
});
