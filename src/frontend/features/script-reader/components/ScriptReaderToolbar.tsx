import {
    BookMarked,
    ChevronDown,
    Download,
    ExternalLink,
    Headphones,
    Languages,
    PanelLeft,
    Plus,
    Search,
    Video,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import type { ReaderMediaType } from '@/common/types/contextStudio';
import { cn } from '@/frontend/lib/utils';
import type {
    ScriptReaderFilter,
    ScriptVocabPreviewItem,
} from '../lib/readerProgress';

interface ScriptReaderToolbarProps {
    title: string;
    mediaType?: ReaderMediaType;
    hasSubtitle: boolean;
    totalSentences: number;
    savedCount: number;
    docCount: number;
    onOpenDocDrawer: () => void;
    onImportAudio: () => void;
    importingAudio: boolean;
    filter: ScriptReaderFilter;
    onChangeFilter: (filter: ScriptReaderFilter) => void;
    searchQuery: string;
    onChangeSearchQuery: (query: string) => void;
    showTranslation: boolean;
    onToggleTranslation: () => void;
    onExportMarkdown: () => void;
    exporting: boolean;
    onOpenInPlayer: () => void;
    vocabSummary: readonly ScriptVocabPreviewItem[];
    onJumpToSentenceIndex: (sentenceIndex: number) => void;
}

/**
 * 精读文稿顶部控台与按需生词雷达：
 * - 顶行：篇目抽屉触发 + 导入音频 + 搜索/筛选 + 译文开关 + 导出 Markdown + 去播放室；
 * - 次行：零存在感设计——平时完全隐藏，仅当本篇确实存在待掌握生词时才露出快速定位条。
 */
export function ScriptReaderToolbar({
    title,
    mediaType = 'video',
    hasSubtitle,
    totalSentences,
    savedCount,
    docCount,
    onOpenDocDrawer,
    onImportAudio,
    importingAudio,
    filter,
    onChangeFilter,
    searchQuery,
    onChangeSearchQuery,
    showTranslation,
    onToggleTranslation,
    onExportMarkdown,
    exporting,
    onOpenInPlayer,
    vocabSummary,
    onJumpToSentenceIndex,
}: ScriptReaderToolbarProps) {
    const { t } = useTranslation('pages');
    const isAudio = mediaType === 'audio';

    return (
        <div className="shrink-0 border-b border-border/40 bg-surface/40 flex flex-col">
            <div className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
                {/* 左侧：切篇抽屉按钮 + 当前文稿信息 */}
                <div className="flex items-center gap-2.5 min-w-0">
                    <button
                        type="button"
                        data-testid="script-doc-switcher"
                        onClick={onOpenDocDrawer}
                        className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-body/80 px-2.5 py-1.5 text-sm font-medium text-primary hover:border-border hover:bg-muted/60 transition-colors cursor-pointer min-w-0 max-w-xs"
                        title={t('scriptReader.switchDocTooltip', { defaultValue: '切换或导入文稿' })}
                    >
                        <PanelLeft className="h-3.5 w-3.5 text-secondary shrink-0" />
                        {isAudio
                            ? <Headphones className="h-3.5 w-3.5 text-accent shrink-0" />
                            : <Video className="h-3.5 w-3.5 text-secondary shrink-0" />}
                        <span className="truncate">{title}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-secondary shrink-0" />
                    </button>

                    <span className="text-metadata text-secondary hidden sm:inline">
                        {t('scriptReader.docMetaCompact', {
                            defaultValue: '{{docs}} 篇 · {{total}} 句 · 收藏 {{saved}}',
                            docs: docCount,
                            total: totalSentences,
                            saved: savedCount,
                        })}
                    </span>
                </div>

                {/* 右侧：导入音频 + 搜索 + 筛选 + 译文 + 导出 + 打开播放室 */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {hasSubtitle && (
                        <>
                            <div className="relative flex items-center">
                                <Search className="h-3.5 w-3.5 text-secondary absolute left-2.5 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => onChangeSearchQuery(e.target.value)}
                                    placeholder={t('scriptReader.searchContent', { defaultValue: '搜文稿/译文...' })}
                                    className="w-36 rounded-lg border border-border/50 bg-body pl-8 pr-7 py-1 text-sm text-primary placeholder:text-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => onChangeSearchQuery('')}
                                        className="absolute right-2 text-secondary hover:text-primary cursor-pointer"
                                        aria-label={t('scriptReader.clearSearch', { defaultValue: '清空搜索' })}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className="shrink-0">
                                <SegmentedControl
                                    size="sm"
                                    value={filter}
                                    onChange={(val) => onChangeFilter(val as ScriptReaderFilter)}
                                    label={t('scriptReader.filterLabel', { defaultValue: '筛选' })}
                                >
                                    <SegmentedControlItem
                                        value="all"
                                        label={t('scriptReader.filterAll', { defaultValue: '全部' })}
                                    />
                                    <SegmentedControlItem
                                        value="learning"
                                        label={t('scriptReader.filterLearning', { defaultValue: '生词' })}
                                    />
                                    <SegmentedControlItem
                                        value="saved"
                                        label={t('scriptReader.filterSaved', { defaultValue: '金句' })}
                                    />
                                </SegmentedControl>
                            </div>

                            <Tooltip content={t('scriptReader.toggleTranslation', { defaultValue: '显示 / 隐藏中文译文' })} placement="below">
                                <button
                                    type="button"
                                    aria-pressed={showTranslation}
                                    onClick={onToggleTranslation}
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition-colors cursor-pointer',
                                        showTranslation
                                            ? 'text-accent bg-accent-bg/15'
                                            : 'text-secondary hover:text-primary hover:bg-muted/80',
                                    )}
                                    aria-label={t('scriptReader.toggleTranslation', { defaultValue: '切换译文' })}
                                >
                                    <Languages className="h-3.5 w-3.5 shrink-0" />
                                    <span>{t('scriptReader.translationShort', { defaultValue: '译文' })}</span>
                                </button>
                            </Tooltip>

                            <Button
                                size="sm"
                                variant="ghost"
                                icon={<Download className="h-3.5 w-3.5" />}
                                label={t('scriptReader.exportMarkdown', { defaultValue: '导出讲义' })}
                                isDisabled={exporting || totalSentences === 0}
                                onClick={onExportMarkdown}
                            />
                        </>
                    )}

                    <Button
                        size="sm"
                        variant="ghost"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        label={t('scriptReader.importAudioShort', { defaultValue: '导入音频' })}
                        isDisabled={importingAudio}
                        onClick={onImportAudio}
                    />

                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                        label={
                            isAudio
                                ? t('scriptReader.openAudioInPlayer', { defaultValue: '播放室精听' })
                                : t('scriptReader.openInPlayer', { defaultValue: '观看视频' })
                        }
                        onClick={onOpenInPlayer}
                    />
                </div>
            </div>

            {/* 仅当本篇确实有正在学习的生词时才按需露出快速定位雷达；无生词时不占用任何像素 */}
            {hasSubtitle && totalSentences > 0 && vocabSummary.length > 0 && (
                <div className="px-5 py-1.5 border-t border-border/30 bg-surface/25 flex flex-wrap items-center gap-1.5 text-metadata">
                    <span className="inline-flex items-center gap-1 text-secondary font-medium shrink-0">
                        <BookMarked className="h-3.5 w-3.5 text-accent" />
                        {t('scriptReader.vocabRadar', { defaultValue: '本篇生词' })}:
                    </span>
                    {vocabSummary.slice(0, 8).map((item) => (
                        <button
                            key={item.word}
                            type="button"
                            onClick={() => onJumpToSentenceIndex(item.firstSentenceIndex)}
                            className="rounded-md border border-border/40 bg-body/80 px-1.5 py-0.5 text-metadata text-primary hover:border-accent/60 hover:text-accent transition-colors cursor-pointer"
                            title={t('scriptReader.jumpToWordSentence', {
                                defaultValue: '跳转到包含 "{{word}}" 的句子',
                                word: item.word,
                            })}
                        >
                            {item.word}
                            {item.count > 1 ? ` ×${item.count}` : ''}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
