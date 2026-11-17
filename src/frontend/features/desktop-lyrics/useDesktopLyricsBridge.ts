import { useEffect, useRef } from 'react';

import MediaUtil from '@/common/utils/MediaUtil';
import StrUtil from '@/common/utils/str-util';
import type { DesktopLyricsSnapshot } from '@/common/contracts/desktop-lyrics';
import { rendererEvents } from '@/frontend/infrastructure/electron/rendererEvents';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import useSubtitleTranslation from '@/frontend/features/player/translationStore';
import { desktopLyricsApi } from './desktopLyricsApi';
import { useDesktopLyricsStore } from './desktopLyricsStore';

const buildCurrentSnapshot = (): DesktopLyricsSnapshot => {
    const { currentSentence, playing, singleRepeat } = usePlayer.getState();
    const { videoPath } = usePlaybackSession.getState();
    const translations = useSubtitleTranslation.getState().translations;
    const translated = currentSentence?.translationKey
        ? (translations.get(currentSentence.translationKey) ?? '')
        : '';
    const fallbackZh = currentSentence?.textZH ?? '';
    const translation = StrUtil.isNotBlank(translated) ? translated : fallbackZh;
    const videoTitle = videoPath ? MediaUtil.fileName(videoPath) : '';

    return {
        hasMedia: Boolean(videoPath),
        playing,
        singleRepeat,
        videoTitle,
        text: currentSentence?.text ?? '',
        translation,
        sentenceKey: currentSentence?.key ?? null,
    };
};

const snapshotEquals = (a: DesktopLyricsSnapshot | null, b: DesktopLyricsSnapshot): boolean => {
    if (!a) return false;
    return a.hasMedia === b.hasMedia
        && a.playing === b.playing
        && a.singleRepeat === b.singleRepeat
        && a.videoTitle === b.videoTitle
        && a.text === b.text
        && a.translation === b.translation
        && a.sentenceKey === b.sentenceKey;
};

/**
 * 挂载在主窗口根部的桌面字幕桥接器：
 * - 监听主进程广播的浮窗开关/穿透状态并写入本地 store；
 * - 仅当桌面浮窗开启时，实时同步当前播放句、翻译与播放状态；
 * - 接收来自桌面浮窗的播放/上下句/单句循环指令，转发给 `usePlayer`。
 */
export function useDesktopLyricsBridge(enabled: boolean): void {
    const open = useDesktopLyricsStore((s) => s.open);
    const lastSentRef = useRef<DesktopLyricsSnapshot | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        void desktopLyricsApi.getState()
            .then((payload) => {
                if (!cancelled) {
                    useDesktopLyricsStore.getState().applyPayload(payload);
                }
            })
            .catch(() => undefined);

        const unsubSync = rendererEvents.onDesktopLyricsSync((payload) => {
            useDesktopLyricsStore.getState().applyWindowState(payload.windowState);
        });

        const unsubCommand = rendererEvents.onDesktopLyricsCommand((command) => {
            const player = usePlayer.getState();
            switch (command) {
                case 'toggle-play':
                    player.togglePlay();
                    break;
                case 'prev-sentence':
                    void player.prevSentence();
                    break;
                case 'next-sentence':
                    void player.nextSentence();
                    break;
                case 'toggle-single-repeat':
                    player.setSingleRepeat(!player.singleRepeat);
                    break;
                default:
                    break;
            }
        });

        return () => {
            cancelled = true;
            unsubSync();
            unsubCommand();
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !open) {
            lastSentRef.current = null;
            return;
        }

        const pushIfChanged = () => {
            const next = buildCurrentSnapshot();
            if (snapshotEquals(lastSentRef.current, next)) {
                return;
            }
            lastSentRef.current = next;
            void desktopLyricsApi.syncState(next).catch(() => undefined);
        };

        pushIfChanged();

        const unsubPlayer = usePlayer.subscribe((state, prevState) => {
            if (
                state.currentSentence === prevState.currentSentence
                && state.playing === prevState.playing
                && state.singleRepeat === prevState.singleRepeat
            ) {
                return;
            }
            pushIfChanged();
        });
        const unsubSession = usePlaybackSession.subscribe((state, prevState) => {
            if (state.videoPath === prevState.videoPath) {
                return;
            }
            pushIfChanged();
        });
        const unsubTranslation = useSubtitleTranslation.subscribe(
            (state) => {
                const key = usePlayer.getState().currentSentence?.translationKey;
                return key ? (state.translations.get(key) ?? '') : '';
            },
            pushIfChanged,
        );

        return () => {
            unsubPlayer();
            unsubSession();
            unsubTranslation();
        };
    }, [enabled, open]);
}
