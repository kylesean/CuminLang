import type { SaveEditedSubtitleResponse } from '@/common/contracts/subtitle-edit';
import { useSavedSentences } from '@/frontend/features/context-studio/savedSentencesStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { usePlayer } from '@/frontend/features/player/playerStore';
import useTranslation from '@/frontend/features/player/translationStore';

/**
 * 将「保存人工编辑轨」或「放弃修订恢复基线轨」返回的最新字幕与解析态同步到播放器各 Store，
 * 通过 preloadedHash 跳过 bridge 的清屏重载，保持播放与翻译平滑衔接。
 */
export function syncSubtitleTrackMutation(
    videoId: string,
    response: SaveEditedSubtitleResponse,
    focusSentenceIndex = 0,
): void {
    usePlayer.getState().loadSubtitles(response.srt.sentences);
    usePlaybackSession.getState().applySavedEditedSubtitle(
        response.srt.filePath,
        response.srt.fileHash,
        response.resolution,
    );
    useTranslation.getState().setActiveFileHash(response.srt.fileHash);
    const focusIdx = Math.min(
        Math.max(0, focusSentenceIndex),
        Math.max(0, response.srt.sentences.length - 1),
    );
    if (response.srt.sentences.length > 0) {
        useTranslation.getState().requestTranslation(response.srt.fileHash, focusIdx);
    }
    void useSavedSentences.getState().loadForVideo(videoId).catch(() => undefined);
}
