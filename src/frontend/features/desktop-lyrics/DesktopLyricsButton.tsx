import { Captions, LockOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@astryxdesign/core/Tooltip';

import { cn } from '@/frontend/lib/utils';
import {
    TOOLBAR_ICON_BUTTON,
    TOOLBAR_TONE,
} from '@/frontend/features/player/components/learning-toolbar/toolbarStyles';
import { desktopLyricsApi } from './desktopLyricsApi';
import { useDesktopLyricsStore } from './desktopLyricsStore';

/**
 * 播放器工具条中的“桌面整句字幕”快捷开关；若当前已锁定鼠标穿透，附带一键解锁提示。
 */
export function DesktopLyricsButton() {
    const { t } = useTranslation('player');
    const open = useDesktopLyricsStore((s) => s.open);
    const locked = useDesktopLyricsStore((s) => s.locked);
    const applyWindowState = useDesktopLyricsStore((s) => s.applyWindowState);
    const style = TOOLBAR_TONE.panel;

    const handleToggle = () => {
        void desktopLyricsApi.toggle(!open)
            .then((next) => applyWindowState(next))
            .catch(() => undefined);
    };

    const handleUnlock = () => {
        void desktopLyricsApi.setLocked(false)
            .then((next) => applyWindowState(next))
            .catch(() => undefined);
    };

    return (
        <div className="inline-flex items-center gap-1 shrink-0">
            <Tooltip
                content={open
                    ? t('controlBar.desktopLyricsClose', { defaultValue: '关闭桌面字幕' })
                    : t('controlBar.desktopLyricsOpen', { defaultValue: '开启桌面整句字幕（可置顶悬浮/穿透）' })}
                placement="above"
            >
                <button
                    type="button"
                    data-testid="player-desktop-lyrics-toggle"
                    onClick={handleToggle}
                    aria-pressed={open}
                    aria-label={t('controlBar.desktopLyrics', { defaultValue: '桌面字幕' })}
                    className={cn(
                        TOOLBAR_ICON_BUTTON,
                        open ? style.accent.amber : style.idle,
                    )}
                >
                    <Captions className="w-4 h-4 stroke-[1.9]" />
                </button>
            </Tooltip>

            {open && locked && (
                <Tooltip
                    content={t('controlBar.desktopLyricsUnlock', { defaultValue: '桌面字幕已锁定穿透，点击恢复可交互' })}
                    placement="above"
                >
                    <button
                        type="button"
                        data-testid="player-desktop-lyrics-unlock"
                        onClick={handleUnlock}
                        aria-label={t('controlBar.desktopLyricsUnlock', { defaultValue: '解锁桌面字幕交互' })}
                        className={cn(TOOLBAR_ICON_BUTTON, style.accent.emerald)}
                    >
                        <LockOpen className="w-3.5 h-3.5 stroke-[2]" />
                    </button>
                </Tooltip>
            )}
        </div>
    );
}
