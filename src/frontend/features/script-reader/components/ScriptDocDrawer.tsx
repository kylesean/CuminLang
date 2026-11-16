import { FileText, Headphones, Loader2, Plus, Search, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@astryxdesign/core/Button';
import type { ReaderDocumentSummary } from '@/common/types/contextStudio';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import { useSubtitleGenerationStore } from '@/frontend/features/player/subtitleGenerationStore';
import { cn } from '@/frontend/lib/utils';
import { getSavedReaderProgress } from '../lib/readerProgress';

interface ScriptDocDrawerProps {
    open: boolean;
    onClose: () => void;
    documents: readonly ReaderDocumentSummary[];
    loadingDocs: boolean;
    docQuery: string;
    onDocQueryChange: (query: string) => void;
    activeVideoId?: string;
    playingVideoId?: string | null;
    onSelectDoc: (videoId: string) => void;
    onImportAudio: () => void;
    importingAudio: boolean;
}

/**
 * 精读文稿可收起篇目抽屉：
 * 区分视频文稿与纯音频播客，实时展示本地转写任务进度，并提供纯音频导入入口。
 */
export function ScriptDocDrawer({
    open,
    onClose,
    documents,
    loadingDocs,
    docQuery,
    onDocQueryChange,
    activeVideoId,
    playingVideoId,
    onSelectDoc,
    onImportAudio,
    importingAudio,
}: ScriptDocDrawerProps) {
    const { t } = useTranslation('pages');
    const taskIdsByVideo = useSubtitleGenerationStore((s) => s.taskIdsByVideo);
    const startingVideos = useSubtitleGenerationStore((s) => s.startingVideos);
    const tasks = useDpTaskCenter((s) => s.tasks);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={t('scriptReader.docDrawerLabel', { defaultValue: '切换精读文稿' })}>
            <div
                className="fixed inset-0 bg-black/25 backdrop-blur-[1px]"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside className="relative z-10 w-80 max-w-[85vw] h-full border-r border-border/50 bg-surface shadow-xl flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-sm font-semibold text-primary">
                        {t('scriptReader.docDrawerTitle', { defaultValue: '全部精读文稿' })}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={importingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            label={t('scriptReader.importAudioShort', { defaultValue: '导入音频' })}
                            isDisabled={importingAudio}
                            onClick={onImportAudio}
                        />
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-muted/70 transition-colors cursor-pointer"
                            aria-label={t('scriptReader.closeDrawer', { defaultValue: '关闭文稿目录' })}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="p-3 border-b border-border/35 shrink-0">
                    <div className="relative flex items-center">
                        <Search className="h-3.5 w-3.5 text-secondary absolute left-2.5 pointer-events-none" />
                        <input
                            type="text"
                            value={docQuery}
                            onChange={(e) => onDocQueryChange(e.target.value)}
                            placeholder={t('scriptReader.searchDocs', { defaultValue: '搜索文稿...' })}
                            className="w-full rounded-lg border border-border/50 bg-body pl-8 pr-3 py-1.5 text-sm text-primary placeholder:text-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full p-2 flex flex-col gap-1">
                    {loadingDocs ? (
                        <div className="p-4 text-center text-sm text-secondary">
                            {t('scriptReader.loadingDocs', { defaultValue: '加载文稿中...' })}
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="p-6 text-center text-sm text-secondary flex flex-col items-center gap-2">
                            <FileText className="h-6 w-6 opacity-50" />
                            <span>{t('scriptReader.emptyDocs', { defaultValue: '暂无文稿，可导入 MP3/M4A 音频生成' })}</span>
                        </div>
                    ) : (
                        documents.map((doc) => {
                            const active = doc.videoId === activeVideoId;
                            const isPlayingInPlayer = doc.videoId === playingVideoId;
                            const savedIndex = getSavedReaderProgress(doc.videoId);
                            const isAudio = doc.mediaType === 'audio';
                            const hasSubtitle = doc.hasSubtitle ?? Boolean(doc.srtFile);
                            const taskId = taskIdsByVideo[doc.videoId];
                            const starting = Boolean(startingVideos[doc.videoId]);
                            const task = taskId !== undefined ? tasks.get(taskId) : undefined;
                            const taskProgress = task && task !== 'init' ? task.progress : null;
                            const transcribing = starting || taskId !== undefined;

                            let subline: string | null = null;
                            if (transcribing) {
                                subline = taskProgress ?? t('scriptReader.transcribingBadge', { defaultValue: '本地识别生成中...' });
                            } else if (!hasSubtitle) {
                                subline = t('scriptReader.pendingTranscriptBadge', { defaultValue: '待转写文稿' });
                            } else if (isPlayingInPlayer) {
                                subline = t('scriptReader.nowPlayingTag', { defaultValue: '当前播放' });
                            } else if (savedIndex !== null && savedIndex > 0) {
                                subline = t('scriptReader.savedProgressTag', {
                                    defaultValue: '上次读到第 {{num}} 句',
                                    num: savedIndex + 1,
                                });
                            }

                            return (
                                <button
                                    key={doc.videoId}
                                    type="button"
                                    onClick={() => {
                                        onSelectDoc(doc.videoId);
                                        onClose();
                                    }}
                                    className={cn(
                                        'w-full text-left rounded-lg px-2.5 py-2 transition-colors cursor-pointer flex items-start gap-2.5',
                                        active
                                            ? 'bg-accent-bg/15 text-accent font-medium'
                                            : 'text-primary/90 hover:bg-muted/60',
                                    )}
                                >
                                    {transcribing ? (
                                        <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin text-accent" />
                                    ) : isAudio ? (
                                        <Headphones className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-75" />
                                    ) : (
                                        <Video className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-75" />
                                    )}
                                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm line-clamp-2 leading-snug flex-1">{doc.title}</span>
                                            <span className="shrink-0 rounded px-1 py-0.2 text-[11px] bg-muted/70 text-secondary font-normal">
                                                {isAudio
                                                    ? t('scriptReader.badgeAudio', { defaultValue: '音频' })
                                                    : t('scriptReader.badgeVideo', { defaultValue: '视频' })}
                                            </span>
                                        </div>
                                        {subline && (
                                            <span className={cn(
                                                'text-metadata font-normal truncate',
                                                transcribing ? 'text-accent' : 'text-secondary',
                                            )}>
                                                {subline}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </aside>
        </div>
    );
}
