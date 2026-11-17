import {
    Filter,
    Languages,
    PanelLeft,
    PanelLeftClose,
    PanelRight,
    PanelRightClose,
    Repeat,
    Search,
    X,
} from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Badge } from '@astryxdesign/core/Badge';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
    DropdownMenu,
    DropdownMenuGroup,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { cn } from '@/frontend/lib/utils';
import { SIDE_TRANSLATION_TOGGLE_TESTID } from '@/common/constants/player-scroll-protocol';
import type { TranscriptVocabularyFilter } from '@/frontend/features/player/transcriptVocabulary';

/**
 * 文稿侧栏顶部工具条入参。
 */
export interface TranscriptToolbarProps {
    transcriptViewMode: 'sentence' | 'article';
    onChangeViewMode: (mode: 'sentence' | 'article') => void;
    loopSentenceCount: number;
    onCancelLoop: () => void;
    isSearchOpen: boolean;
    onToggleSearch: () => void;
    vocabularyFilter: TranscriptVocabularyFilter;
    onChangeVocabularyFilter: (filter: TranscriptVocabularyFilter) => void;
    filterCounts: { all: number; learning: number; familiar: number };
    showSideTranslation: boolean;
    onToggleSideTranslation: () => void;
    transcriptPosition: 'left' | 'right';
    onToggleTranscriptPosition: () => void;
    onCloseTranscript: () => void;
}

/**
 * 右侧字幕文稿流的状态与操作栏（逐句/讲稿切换、循环状态、搜索、词汇筛选、译文开关及停靠/收起）。
 */
export function TranscriptToolbar({
    transcriptViewMode,
    onChangeViewMode,
    loopSentenceCount,
    onCancelLoop,
    isSearchOpen,
    onToggleSearch,
    vocabularyFilter,
    onChangeVocabularyFilter,
    filterCounts,
    showSideTranslation,
    onToggleSideTranslation,
    transcriptPosition,
    onToggleTranscriptPosition,
    onCloseTranscript,
}: TranscriptToolbarProps) {
    const { t } = useI18nTranslation('player');

    return (
        <div className="shrink-0 px-3.5 py-2 flex items-center justify-between gap-2 border-b border-border/40 bg-surface/50 backdrop-blur-md z-10 text-sm overflow-x-hidden">
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="shrink-0">
                    <SegmentedControl
                        value={transcriptViewMode}
                        onChange={(val) => onChangeViewMode(val as 'sentence' | 'article')}
                        size="sm"
                        label={t('transcriptViewModeLabel', { defaultValue: '文稿视图模式' })}
                    >
                        <SegmentedControlItem
                            value="sentence"
                            label={t('transcriptViewSentence', { defaultValue: '逐句' })}
                        />
                        <SegmentedControlItem
                            value="article"
                            label={t('transcriptViewArticle', { defaultValue: '讲稿' })}
                        />
                    </SegmentedControl>
                </div>
                {loopSentenceCount > 1 && (
                    <div className="flex items-center gap-1 min-w-0">
                        <Badge
                            variant="teal"
                            icon={<Repeat className="w-2.5 h-2.5 shrink-0" />}
                            label={t('nSentencesLoop', { count: loopSentenceCount, defaultValue: `${loopSentenceCount} 句循环` })}
                            className="max-w-full truncate"
                        />
                        <Tooltip content={t('cancelLoop')} placement="below">
                            <button
                                type="button"
                                onClick={onCancelLoop}
                                className="p-0.5 rounded-full text-secondary hover:text-primary hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors cursor-pointer shrink-0"
                                aria-label={t('cancelLoop')}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </Tooltip>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <Tooltip content={t('searchTranscript', { defaultValue: '搜索文稿 (Cmd/Ctrl+F)' })} placement="below">
                    <button
                        type="button"
                        onClick={onToggleSearch}
                        className={cn(
                            'p-1 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                            isSearchOpen
                                ? 'text-accent bg-accent-muted/20'
                                : 'text-secondary hover:text-primary hover:bg-muted/80',
                        )}
                        aria-label={t('searchTranscript', { defaultValue: '搜索文稿 (Cmd/Ctrl+F)' })}
                    >
                        <Search className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>

                <DropdownMenu
                    button={{
                        label: t('transcriptVocabulary.filterLabel', { defaultValue: '筛选' }),
                        icon: (
                            <span className="relative inline-flex items-center justify-center">
                                <Filter className="w-3.5 h-3.5" />
                                {vocabularyFilter !== 'all' && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent-bg ring-1 ring-body" />
                                )}
                            </span>
                        ),
                        size: 'sm',
                        variant: 'ghost',
                        isIconOnly: true,
                        tooltip: t('transcriptVocabulary.filterTooltip', { defaultValue: '按词汇状态筛选文稿' }),
                    }}
                    hasChevron={false}
                    placement="below"
                    alignment="end"
                >
                    <DropdownMenuGroup title={t('transcriptVocabulary.filterTitle', { defaultValue: '只看' })}>
                        <DropdownMenuRadioGroup
                            value={vocabularyFilter}
                            onChange={(next) => onChangeVocabularyFilter(next as TranscriptVocabularyFilter)}
                            label={t('transcriptVocabulary.filterTitle', { defaultValue: '只看' })}
                        >
                            <DropdownMenuRadioItem
                                value="all"
                                label={t('transcriptVocabulary.filterAll', { defaultValue: '全部句子' })}
                                endContent={filterCounts.all}
                            />
                            <DropdownMenuRadioItem
                                value="learning"
                                label={t('transcriptVocabulary.filterLearning', { defaultValue: '含待学词' })}
                                endContent={filterCounts.learning}
                            />
                            <DropdownMenuRadioItem
                                value="familiar"
                                label={t('transcriptVocabulary.filterFamiliar', { defaultValue: '含有印象的词' })}
                                endContent={filterCounts.familiar}
                            />
                        </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                </DropdownMenu>

                <Tooltip content={t('controlBox.sideTranslationHint')} placement="below">
                    <button
                        type="button"
                        data-testid={SIDE_TRANSLATION_TOGGLE_TESTID}
                        aria-pressed={showSideTranslation}
                        aria-label={t('controlBox.showSideTranslation')}
                        onClick={onToggleSideTranslation}
                        className={cn(
                            'p-1 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                            showSideTranslation
                                ? 'text-accent hover:bg-accent-muted/20'
                                : 'text-secondary hover:text-primary hover:bg-muted/80',
                        )}
                    >
                        <Languages className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>

                <div className="h-3.5 w-px bg-border/40 mx-0.5 shrink-0" aria-hidden="true" />

                <Tooltip
                    content={transcriptPosition === 'right' ? t('dockToLeft') : t('dockToRight')}
                    placement="below"
                >
                    <button
                        type="button"
                        onClick={onToggleTranscriptPosition}
                        className="p-1 rounded-md text-secondary hover:text-primary hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors cursor-pointer"
                        aria-label={transcriptPosition === 'right' ? t('dockToLeft') : t('dockToRight')}
                    >
                        {transcriptPosition === 'right' ? (
                            <PanelLeft className="w-3.5 h-3.5" />
                        ) : (
                            <PanelRight className="w-3.5 h-3.5" />
                        )}
                    </button>
                </Tooltip>

                <Tooltip content={t('controlButton.closeTranscript', { defaultValue: '收起字幕文稿' })} placement="below">
                    <button
                        type="button"
                        onClick={onCloseTranscript}
                        className="p-1 rounded-md text-secondary hover:text-primary hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors cursor-pointer"
                        aria-label={t('controlButton.closeTranscript', { defaultValue: '收起字幕文稿' })}
                    >
                        {transcriptPosition === 'right' ? (
                            <PanelRightClose className="w-3.5 h-3.5" />
                        ) : (
                            <PanelLeftClose className="w-3.5 h-3.5" />
                        )}
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
