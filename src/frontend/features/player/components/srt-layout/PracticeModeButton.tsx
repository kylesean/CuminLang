import { Mic } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { cn } from '@/frontend/lib/utils';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { usePlayer } from '@/frontend/features/player/playerStore';
import usePracticePanel from '@/frontend/features/practice/practiceStore';
import { exitOverlayView, togglePlayerView } from '@/frontend/features/player/lib/player-view-controller';
import {
    CAPTION_CARD_BUTTON_CLASS,
    CAPTION_CARD_IDLE_CLASS,
    captionCardActiveClass,
} from '@/frontend/features/player/components/captionCardShell';
import {
    TOOLBAR_ICON_BUTTON,
    TOOLBAR_TONE,
    type ToolbarTone,
} from '@/frontend/features/player/components/learning-toolbar/toolbarStyles';

/**
 * 跟读/听写练习开关按钮。
 *
 * 打开练习覆盖面板对当前意群做跟读或听写;与整句学习页互斥——打开时先收起学习页,
 * 并暂停播放避免原句声音混进录音。
 *
 * @param variant `capsule`：学习页右下角胶囊里的 24px 正圆；`toolbar`：字幕学习台或控制条里的 32px 方形按钮。
 * @param tone `toolbar` 变体下的视觉底色，`overlay` 用于全屏深色条。
 * @returns 练习开关按钮。
 */
export default function PracticeModeButton({
    variant = 'capsule',
    tone = 'panel',
}: {
    variant?: 'capsule' | 'toolbar';
    tone?: ToolbarTone;
} = {}) {
    const { t } = useI18nTranslation('practice');
    const visible = usePracticePanel((s) => s.visible);

    const handleClick = (): void => {
        const { currentSentence } = usePlayer.getState();
        if (!currentSentence) {
            toast.error(t('panel.noSentence'));
            return;
        }
        if (visible) {
            // 退出练习同样要回到进入前的底层视图：音频文件原来是播客模式。
            exitOverlayView();
            return;
        }
        // 互斥由统一入口处理：打开练习会收起学习页与播客模式。
        const next = togglePlayerView('practice');
        if (next === 'practice') {
            usePlayer.getState().pause();
        }
    };

    return (
        <Tooltip content={t('panel.title')} placement="above">
            <button
                type="button"
                onClick={handleClick}
                aria-label={t('panel.title')}
                className={cn(
                    variant === 'toolbar' ? TOOLBAR_ICON_BUTTON : CAPTION_CARD_BUTTON_CLASS,
                    tone === 'overlay'
                        ? (visible ? TOOLBAR_TONE.overlay.accent.emerald : TOOLBAR_TONE.overlay.idle)
                        : (visible ? captionCardActiveClass('emerald') : CAPTION_CARD_IDLE_CLASS)
                )}
            >
                <Mic className="w-4 h-4" />
            </button>
        </Tooltip>
    );
}
