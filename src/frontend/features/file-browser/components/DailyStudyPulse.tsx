import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Brain } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { contextStudioApi } from '@/frontend/features/context-studio/contextStudioApi';
import { getLatestSavedReaderProgress } from '@/frontend/features/script-reader/lib/readerProgress';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';

interface StudyPulseState {
    dueCount: number;
    latestReader: { videoId: string; title: string } | null;
}

async function fetchDailyStudyPulse(): Promise<StudyPulseState | null> {
    const latestSaved = getLatestSavedReaderProgress();
    const [reviewRes, docsRes] = await Promise.allSettled([
        typeof videoLearningApi?.getReviewQueue === 'function'
            ? videoLearningApi.getReviewQueue(1)
            : Promise.resolve(null),
        typeof contextStudioApi?.listReaderDocuments === 'function'
            ? contextStudioApi.listReaderDocuments()
            : Promise.resolve([]),
    ]);

    const dueCount =
        reviewRes.status === 'fulfilled' && reviewRes.value
            ? (reviewRes.value.dueCount ?? reviewRes.value.items?.length ?? 0)
            : 0;

    const docs =
        docsRes.status === 'fulfilled' && Array.isArray(docsRes.value)
            ? docsRes.value
            : [];

    let latestReader: { videoId: string; title: string } | null = null;
    if (latestSaved) {
        const matched = docs.find((doc) => doc.videoId === latestSaved.videoId);
        if (matched) {
            latestReader = { videoId: matched.videoId, title: matched.title };
        }
    } else if (docs.length > 0) {
        latestReader = { videoId: docs[0].videoId, title: docs[0].title };
    }

    if (dueCount <= 0 && !latestReader) {
        return null;
    }
    return { dueCount, latestReader };
}

/**
 * 首页轻量学习脉冲条：仅在存在待复习词汇或最近精读进度时展示，
 * 让用户无需进入二级菜单即可一键进入今日训练或续读上次文稿。
 */
export function DailyStudyPulse() {
    const { t } = useTranslation('pages');
    const navigate = useNavigate();
    const { data: pulse } = useSWR<StudyPulseState | null>(
        'daily-study-pulse',
        fetchDailyStudyPulse,
        {
            dedupingInterval: 0,
            revalidateOnMount: true,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    if (!pulse) {
        return null;
    }

    return (
        <div
            data-testid="daily-study-pulse"
            className="rounded-lg border border-border/50 bg-surface/60 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        >
            <div className="flex items-center gap-4 flex-wrap min-w-0">
                {pulse.dueCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                        <Brain className="w-4 h-4 text-accent shrink-0" />
                        <span>
                            {t('home.dailyPulseDue', {
                                count: pulse.dueCount,
                                defaultValue: `今日待复习 ${pulse.dueCount} 词`,
                            })}
                        </span>
                    </div>
                )}
                {pulse.latestReader && (
                    <div className="flex items-center gap-2 text-sm text-secondary min-w-0">
                        <BookOpen className="w-4 h-4 text-secondary shrink-0" />
                        <span className="truncate max-w-xs">
                            {t('home.dailyPulseReader', {
                                title: pulse.latestReader.title,
                                defaultValue: `上次精读 · ${pulse.latestReader.title}`,
                            })}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {pulse.latestReader && (
                    <Button
                        size="sm"
                        variant="ghost"
                        icon={<BookOpen className="w-3.5 h-3.5" />}
                        label={t('home.continueReaderCta', { defaultValue: '继续精读' })}
                        onClick={() =>
                            navigate(`/reader/${encodeURIComponent(pulse.latestReader!.videoId)}`)
                        }
                    />
                )}
                {pulse.dueCount > 0 && (
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<ArrowRight className="w-3.5 h-3.5" />}
                        label={t('home.startTodayReviewCta', { defaultValue: '进入今日训练' })}
                        onClick={() => navigate('/context-studio?view=review')}
                    />
                )}
            </div>
        </div>
    );
}
