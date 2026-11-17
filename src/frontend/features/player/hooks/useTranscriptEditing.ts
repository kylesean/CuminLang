import { useCallback, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import type { EditedSubtitleLineInput } from '@/common/contracts/subtitle-edit';
import type { Sentence } from '@/common/types/SentenceC';
import { syncSubtitleTrackMutation } from '@/frontend/features/player/lib/syncSubtitleTrackMutation';
import {
    mergeSentenceWithNext,
    replaceSentenceText,
    splitSentenceAtCursor,
    toEditedSubtitleLines,
} from '@/frontend/features/player/lib/transcript-edit-ops';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { usePlayer } from '@/frontend/features/player/playerStore';

const MAX_UNDO_HISTORY = 30;

export const sentenceEditKey = (sentence: Pick<Sentence, 'fileHash' | 'index'>): string =>
    `${sentence.fileHash}:${sentence.index}`;

/**
 * 编排右侧字幕文稿的原地实时编辑：改词、光标拆句、并入下句、撤销，
 * 以及 L3 `.edited.srt` 原子落盘与播放器状态无闪烁同步。
 */
export function useTranscriptEditing() {
    const { t } = useI18nTranslation('player');
    const videoId = usePlaybackSession((s) => s.videoId);
    const subtitleOrigin = usePlaybackSession((s) => s.subtitleOrigin);
    const [editingState, setEditingState] = useState<{ videoId: string | null; key: string | null }>({
        videoId: null,
        key: null,
    });
    const [saving, setSaving] = useState(false);
    const [undoState, setUndoState] = useState<{ videoId: string | null; count: number }>({
        videoId: null,
        count: 0,
    });
    const undoStackRef = useRef<{ videoId: string | null; stack: EditedSubtitleLineInput[][] }>({
        videoId: null,
        stack: [],
    });

    const editingSentenceKey = editingState.videoId === videoId ? editingState.key : null;
    const canUndo = undoState.videoId === videoId
        && undoState.count > 0
        && (subtitleOrigin === null || subtitleOrigin === 'user_edited');

    const startEditing = useCallback((sentence: Sentence) => {
        if (saving) return;
        usePlayer.getState().clearVirtualGroup();
        const activeVideoId = usePlaybackSession.getState().videoId;
        setEditingState({ videoId: activeVideoId, key: sentenceEditKey(sentence) });
    }, [saving]);

    const cancelEditing = useCallback(() => {
        setEditingState({ videoId: null, key: null });
    }, []);

    const persistLines = useCallback(async (
        nextLines: EditedSubtitleLineInput[],
        options?: { recordUndo?: boolean; focusSentenceIndex?: number; notifyUndo?: boolean },
    ) => {
        const session = usePlaybackSession.getState();
        const currentVideoId = session.videoId;
        if (!currentVideoId || nextLines.length === 0 || saving) {
            return false;
        }
        const currentSentences = usePlayer.getState().sentences;
        const previousSnapshot = toEditedSubtitleLines(currentSentences);

        setSaving(true);
        try {
            const response = await playerApi.saveEditedSubtitle({
                videoId: currentVideoId,
                ...(session.videoPath ? { videoPath: session.videoPath } : {}),
                ...(session.subtitlePath ? { sourceSubtitlePath: session.subtitlePath } : {}),
                ...(session.srtHash ? { oldFileHash: session.srtHash } : {}),
                lines: nextLines,
            });
            if (usePlaybackSession.getState().videoId !== currentVideoId) {
                return false;
            }
            if (options?.recordUndo !== false && previousSnapshot.length > 0) {
                if (undoStackRef.current.videoId !== currentVideoId) {
                    undoStackRef.current = { videoId: currentVideoId, stack: [] };
                }
                const stack = undoStackRef.current.stack;
                stack.push(previousSnapshot);
                if (stack.length > MAX_UNDO_HISTORY) {
                    stack.shift();
                }
                setUndoState({ videoId: currentVideoId, count: stack.length });
            }

            syncSubtitleTrackMutation(currentVideoId, response, options?.focusSentenceIndex ?? 0);
            setEditingState({ videoId: currentVideoId, key: null });
            if (options?.notifyUndo) {
                toast.success(t('sideSentence.editUndone'));
            } else if (options?.recordUndo !== false) {
                toast.success(t('sideSentence.editSaved'));
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('sideSentence.editSaveFailed', { message }));
            return false;
        } finally {
            setSaving(false);
        }
    }, [saving, t]);

    const commitEdit = useCallback(async (sentence: Sentence, nextText: string) => {
        const sentences = usePlayer.getState().sentences;
        const nextLines = replaceSentenceText(sentences, sentence.index, nextText);
        if (!nextLines) {
            setEditingState({ videoId: null, key: null });
            return false;
        }
        return persistLines(nextLines, { focusSentenceIndex: sentence.index });
    }, [persistLines]);

    const splitAtCursor = useCallback(async (
        sentence: Sentence,
        draftText: string,
        cursorOffset: number,
    ) => {
        const sentences = usePlayer.getState().sentences;
        const nextLines = splitSentenceAtCursor(sentences, sentence.index, draftText, cursorOffset);
        if (!nextLines) {
            return false;
        }
        return persistLines(nextLines, { focusSentenceIndex: sentence.index });
    }, [persistLines]);

    const mergeWithNext = useCallback(async (sentence: Sentence, draftText?: string) => {
        const sentences = usePlayer.getState().sentences;
        const nextLines = mergeSentenceWithNext(sentences, sentence.index, draftText);
        if (!nextLines) {
            return false;
        }
        return persistLines(nextLines, { focusSentenceIndex: sentence.index });
    }, [persistLines]);

    const undoLastEdit = useCallback(async () => {
        const activeVideoId = usePlaybackSession.getState().videoId;
        if (undoStackRef.current.videoId !== activeVideoId) {
            return false;
        }
        const stack = undoStackRef.current.stack;
        if (stack.length === 0 || saving) {
            return false;
        }
        const snapshot = stack.pop()!;
        setUndoState({ videoId: activeVideoId, count: stack.length });
        const restored = await persistLines(snapshot, { recordUndo: false, notifyUndo: true });
        if (!restored) {
            stack.push(snapshot);
            setUndoState({ videoId: activeVideoId, count: stack.length });
        }
        return restored;
    }, [persistLines, saving]);

    return {
        editingSentenceKey,
        saving,
        canUndo,
        startEditing,
        cancelEditing,
        commitEdit,
        splitAtCursor,
        mergeWithNext,
        undoLastEdit,
    };
}
