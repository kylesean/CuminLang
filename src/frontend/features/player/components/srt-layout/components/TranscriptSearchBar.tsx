import type { RefObject } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Tooltip } from '@astryxdesign/core/Tooltip';

/**
 * 文稿实时搜索栏入参。
 */
export interface TranscriptSearchBarProps {
    inputRef: RefObject<HTMLInputElement | null>;
    query: string;
    matchCount: number;
    activeMatchIndex: number;
    onQueryChange: (value: string) => void;
    onPrevMatch: () => void;
    onNextMatch: () => void;
    onClose: () => void;
}

/**
 * 字幕文稿中英文实时搜索栏，支持 Enter / Shift+Enter / 上下键及 Esc 快捷操作。
 */
export function TranscriptSearchBar({
    inputRef,
    query,
    matchCount,
    activeMatchIndex,
    onQueryChange,
    onPrevMatch,
    onNextMatch,
    onClose,
}: TranscriptSearchBarProps) {
    const { t } = useI18nTranslation('player');

    return (
        <div className="shrink-0 px-3 py-1.5 border-b border-border/40 bg-surface/80 backdrop-blur-md flex items-center gap-2 text-sm z-20">
            <Search className="w-3.5 h-3.5 text-secondary shrink-0" />
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            onPrevMatch();
                        } else {
                            onNextMatch();
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        onPrevMatch();
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        onNextMatch();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onClose();
                    }
                }}
                placeholder={t('searchPlaceholder', { defaultValue: '在文稿中搜索中英文...' })}
                className="flex-1 bg-transparent border-none outline-none text-primary placeholder:text-secondary/60 text-sm min-w-0"
            />
            {query.trim() && (
                <span className="text-metadata font-mono text-secondary shrink-0 select-none">
                    {matchCount > 0 && activeMatchIndex >= 0 ? (
                        `${activeMatchIndex + 1}/${matchCount}`
                    ) : (
                        <span className="text-secondary/60">{t('noSearchResults', { defaultValue: '无匹配' })}</span>
                    )}
                </span>
            )}
            <div className="flex items-center gap-0.5 shrink-0">
                <Tooltip content={t('prevMatch', { defaultValue: '上一个匹配 (Shift+Enter)' })} placement="below">
                    <button
                        type="button"
                        aria-disabled={matchCount === 0}
                        onClick={() => {
                            if (matchCount === 0) return;
                            onPrevMatch();
                        }}
                        className="p-1 rounded text-secondary hover:text-primary hover:bg-muted/80 aria-disabled:opacity-30 aria-disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label={t('prevMatch', { defaultValue: '上一个匹配 (Shift+Enter)' })}
                    >
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>
                <Tooltip content={t('nextMatch', { defaultValue: '下一个匹配 (Enter)' })} placement="below">
                    <button
                        type="button"
                        aria-disabled={matchCount === 0}
                        onClick={() => {
                            if (matchCount === 0) return;
                            onNextMatch();
                        }}
                        className="p-1 rounded text-secondary hover:text-primary hover:bg-muted/80 aria-disabled:opacity-30 aria-disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label={t('nextMatch', { defaultValue: '下一个匹配 (Enter)' })}
                    >
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>
                <Tooltip content={t('closeSearch', { defaultValue: '关闭搜索 (Esc)' })} placement="below">
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded text-secondary hover:text-primary hover:bg-muted/80 transition-colors cursor-pointer"
                        aria-label={t('closeSearch', { defaultValue: '关闭搜索 (Esc)' })}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
