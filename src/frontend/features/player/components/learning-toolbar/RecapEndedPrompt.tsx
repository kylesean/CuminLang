import { ListChecks, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';

import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { buildLearningSessionKey } from '@/frontend/features/player/learningSessionStore';
import { useRecapPromptStore } from './recapPromptStore';

/**
 * 视频自然结束时的复盘提示。
 *
 * 采用贴合主字幕区语境的轻量提示卡，避免重型告警横幅在深/浅主题下破坏沉浸感，
 * 提示可关闭且同一会话只出现一次——切到别的视频后自动失效。
 */
export default function RecapEndedPrompt() {
    const { t } = useTranslation('player');
    const { t: tRecap } = useTranslation('recap');
    const videoId = usePlaybackSession((state) => state.videoId);
    const srtHash = usePlaybackSession((state) => state.srtHash);
    const promptKey = useRecapPromptStore((state) => state.promptKey);
    const dismiss = useRecapPromptStore((state) => state.dismiss);
    const setRecapOpen = useRecapPromptStore((state) => state.setRecapOpen);

    const sessionKey = buildLearningSessionKey(videoId ?? null, srtHash ?? null);
    if (promptKey === null || promptKey !== sessionKey) {
        return null;
    }

    return (
        <div className="px-3 pb-1.5" data-testid="recap-ended-prompt">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/95 px-3 py-2 text-primary shadow-xs">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-bg/10 text-accent">
                        <ListChecks className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-primary">
                            {t('learningSummary.endedTitle')}
                        </p>
                        <p className="truncate text-metadata text-secondary">
                            {t('learningSummary.endedHint')}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        variant="primary"
                        size="sm"
                        label={tRecap('cta')}
                        onClick={() => {
                            dismiss();
                            setRecapOpen(true);
                        }}
                    />
                    <IconButton
                        variant="ghost"
                        size="sm"
                        icon={<X className="h-3.5 w-3.5" />}
                        label={t('learningSummary.endedDismiss')}
                        tooltip={t('learningSummary.endedDismiss')}
                        onClick={dismiss}
                    />
                </div>
            </div>
        </div>
    );
}
