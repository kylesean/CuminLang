import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { SavedSentenceVO } from '@/common/types/contextStudio';
import type { Sentence } from '@/common/types/SentenceC';
import { renderSentenceTokens } from '@/frontend/features/player/components/srt-layout/sentence-token-renderer';
import { highlightSlice } from '@/frontend/features/player/components/srt-layout/transcript-highlight';
import {
    groupSentencesIntoBlocks,
    needsBilingualCueSpace,
    type SentenceBlock,
} from '@/frontend/features/player/lib/sentence-grouping';
import useSubtitleTranslation from '@/frontend/features/player/translationStore';
import { cn } from '@/frontend/lib/utils';

interface ScriptArticleParagraphProps {
    block: SentenceBlock;
    activeSentenceIndex: number | null;
    editingSentenceKey: string | null;
    isSavingEdit: boolean;
    showTranslation: boolean;
    searchQuery: string;
    savedKeys: ReadonlySet<string>;
    savedByKey: ReadonlyMap<string, SavedSentenceVO>;
    onSelectSentence: (sentence: Sentence) => void;
    onCommitEdit: (startIndex: number, endIndex: number, nextText: string) => void;
    onCancelEdit: () => void;
}

interface ParagraphInlineEditorProps {
    initialText: string;
    startIndex: number;
    endIndex: number;
    isSaving: boolean;
    onCommit: (startIndex: number, endIndex: number, nextText: string) => void;
    onCancel: () => void;
}

function ParagraphInlineEditor({
    initialText,
    startIndex,
    endIndex,
    isSaving,
    onCommit,
    onCancel,
}: ParagraphInlineEditorProps) {
    const [draft, setDraft] = useState(initialText);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const el = inputRef.current;
        if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }
    }, []);

    const handleBlur = () => {
        const normalized = draft.replace(/\s+/g, ' ').trim();
        if (normalized && normalized !== initialText.trim()) {
            onCommit(startIndex, endIndex, draft);
        } else {
            onCancel();
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            data-testid="script-inline-editor"
            data-inline-editor="true"
            disabled={isSaving}
            value={draft}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCommit(startIndex, endIndex, draft);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel();
                }
            }}
            className="inline-block w-full rounded-md px-2 py-0.5 my-0.5 bg-card/90 text-primary border border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
    );
}

function ScriptParagraphZhSpan({
    sentence,
    isCurrent,
    hasTrailingSpace,
    searchQuery,
    onSelectSentence,
}: {
    sentence: Sentence;
    isCurrent: boolean;
    hasTrailingSpace: boolean;
    searchQuery: string;
    onSelectSentence: (sentence: Sentence) => void;
}) {
    const translationKey = sentence.translationKey || '';
    const aiTranslation = useSubtitleTranslation(
        (state) => (translationKey ? state.translations.get(translationKey) : undefined),
    );
    const zhText = sentence.textZH || aiTranslation || '';
    if (!zhText) {
        return null;
    }

    return (
        <span
            role="button"
            tabIndex={0}
            onClick={() => onSelectSentence(sentence)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSentence(sentence);
                }
            }}
            className={cn(
                'inline rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                isCurrent ? 'text-primary font-medium' : 'text-secondary/80 hover:text-primary',
            )}
        >
            {highlightSlice(zhText, zhText, 0, searchQuery, false)}
            {hasTrailingSpace ? ' ' : ''}
        </span>
    );
}

const TRANSLATION_LOADING_TIMEOUT_MS = 12_000;

function ScriptParagraphTranslationRow({
    sentences,
    units,
    activeSentenceIndex,
    searchQuery,
    onSelectSentence,
}: {
    sentences: readonly Sentence[];
    units: readonly SentenceBlock[];
    activeSentenceIndex: number | null;
    searchQuery: string;
    onSelectSentence: (sentence: Sentence) => void;
}) {
    const { t } = useTranslation('pages');
    const engine = useSubtitleTranslation((state) => state.engine);
    const activeFileHash = useSubtitleTranslation((state) => state.activeFileHash);
    const translationKeysSignature = sentences.map((s) => s.translationKey || '').join('|');
    const aiTranslations = useSubtitleTranslation(
        useShallow((state) =>
            sentences.map((s) => (s.translationKey ? state.translations.get(s.translationKey) ?? '' : '')),
        ),
    );
    const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
    const loadingKey = `${activeFileHash ?? ''}:${engine}:${translationKeysSignature}`;
    const loadingTimedOut = timedOutKey === loadingKey;

    const hasAnyTranslation = sentences.some((s, idx) => {
        if (s.textZH && s.textZH.trim().length > 0) return true;
        return Boolean(aiTranslations[idx]);
    });
    const hasTranslationKeys = sentences.some((s) => Boolean(s.translationKey));

    useEffect(() => {
        if (hasAnyTranslation || engine === 'none' || !hasTranslationKeys) {
            return;
        }
        const timer = window.setTimeout(() => {
            setTimedOutKey(loadingKey);
        }, TRANSLATION_LOADING_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [hasAnyTranslation, engine, hasTranslationKeys, loadingKey]);

    if (!hasAnyTranslation) {
        if (engine === 'none' || !hasTranslationKeys || loadingTimedOut) {
            return null;
        }
        return (
            <p className="text-metadata text-secondary/55 animate-pulse">
                {t('scriptReader.translationLoading', { defaultValue: '译文加载中...' })}
            </p>
        );
    }

    const aiTranslationBySentenceIndex = new Map<number, string>();
    sentences.forEach((s, idx) => {
        if (aiTranslations[idx]) {
            aiTranslationBySentenceIndex.set(s.index, aiTranslations[idx]);
        }
    });

    const renderedItems: Array<{ sentence: Sentence; zhText: string; isCurrent: boolean }> = [];
    for (const unit of units) {
        const isUnitCurrent = unit.sentences.some((s) => s.index === activeSentenceIndex);
        for (const s of unit.sentences) {
            const aiZh = aiTranslationBySentenceIndex.get(s.index);
            const zhText = s.textZH || aiZh || '';
            if (zhText) {
                renderedItems.push({ sentence: s, zhText, isCurrent: isUnitCurrent });
            }
        }
    }

    return (
        <p className="text-sm text-secondary/80 leading-relaxed select-text empty:hidden">
            {renderedItems.map((item, idx) => (
                <ScriptParagraphZhSpan
                    key={`zh-${item.sentence.fileHash}:${item.sentence.index}`}
                    sentence={item.sentence}
                    isCurrent={item.isCurrent}
                    hasTrailingSpace={needsBilingualCueSpace(item.zhText, renderedItems[idx + 1]?.zhText)}
                    searchQuery={searchQuery}
                    onSelectSentence={onSelectSentence}
                />
            ))}
        </p>
    );
}

/**
 * 精读文稿核心书卷自然段组件：
 * - 先通过 `groupSentencesIntoBlocks` 把跨 cue 的半句话归并为完整意群句再行高亮与交互；
 * - 无卡片边框、无高频伪章节打断，保持纯粹连贯的书籍阅读呼吸感；
 * - 译文未就绪且已开启翻译引擎时显示温和加载提示。
 */
export function ScriptArticleParagraph({
    block,
    activeSentenceIndex,
    editingSentenceKey,
    isSavingEdit,
    showTranslation,
    searchQuery,
    savedKeys,
    savedByKey,
    onSelectSentence,
    onCommitEdit,
    onCancelEdit,
}: ScriptArticleParagraphProps) {
    const { t } = useTranslation('pages');

    // 把段落内因 SRT 切行导致的连续半句重新归并为「完整学习句」单元
    const logicalUnits = useMemo(
        () => groupSentencesIntoBlocks(block.sentences),
        [block.sentences],
    );

    const annotatedInBlock = block.sentences.filter((s) => {
        const key = `${s.fileHash}:${s.index}`;
        return savedKeys.has(key) || Boolean(savedByKey.get(key)?.note?.trim());
    });

    return (
        <article className="max-w-2xl mx-auto w-full flex flex-col gap-2">
            {/* 连贯英文阅读流（以完整句单元聚焦高亮） */}
            <div className="text-base leading-relaxed text-primary/90 select-text break-words">
                {logicalUnits.map((unit, uIdx) => {
                    const unitKey = `${unit.repr.fileHash}:${unit.repr.index}`;
                    const lastSentence = unit.sentences[unit.sentences.length - 1];
                    const isUnitCurrent = unit.sentences.some((s) => s.index === activeSentenceIndex);
                    const isEditingUnit = unit.sentences.some(
                        (s) => editingSentenceKey === `${s.fileHash}:${s.index}`,
                    );
                    const unitSaved = unit.sentences.some((s) => savedKeys.has(`${s.fileHash}:${s.index}`));
                    const unitHasNote = unit.sentences.some((s) =>
                        Boolean(savedByKey.get(`${s.fileHash}:${s.index}`)?.note?.trim()),
                    );
                    const unitText = unit.sentences.map((s) => s.text.trim()).filter(Boolean).join(' ');

                    if (isEditingUnit) {
                        return (
                            <ParagraphInlineEditor
                                key={`edit-${unitKey}`}
                                initialText={unitText}
                                startIndex={unit.repr.index}
                                endIndex={lastSentence.index}
                                isSaving={isSavingEdit}
                                onCommit={onCommitEdit}
                                onCancel={onCancelEdit}
                            />
                        );
                    }

                    return (
                        <span key={unitKey}>
                            <span
                                role="button"
                                tabIndex={0}
                                data-sentence-unit={unitKey}
                                data-sentence-unit-text={unitText}
                                data-active={isUnitCurrent ? 'true' : 'false'}
                                onClickCapture={() => {
                                    // 用捕获阶段绕开内部 Word 的 stopPropagation：
                                    // 点词查义时同时把右侧精读案头切到这句话，避免只能靠右栏箭头切句。
                                    const selectedText = typeof window !== 'undefined'
                                        ? window.getSelection()?.toString().trim()
                                        : '';
                                    if (selectedText) {
                                        return;
                                    }
                                    onSelectSentence(unit.repr);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectSentence(unit.repr);
                                    }
                                }}
                                className={cn(
                                    'inline cursor-pointer transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                                    isUnitCurrent
                                        ? 'text-primary font-medium underline decoration-accent/70 decoration-[1.5px] underline-offset-[5px]'
                                        : 'hover:text-primary hover:underline hover:decoration-border hover:underline-offset-[5px]',
                                )}
                            >
                                {unit.sentences.map((s, sIdx) => (
                                    <span
                                        key={`${s.fileHash}:${s.index}`}
                                        data-testid={`script-sentence-row-${s.index}`}
                                        data-active={isUnitCurrent ? 'true' : 'false'}
                                    >
                                        {renderSentenceTokens({
                                            sentence: s,
                                            text: s.text || '',
                                            searchQuery,
                                            isActiveMatch: false,
                                            alwaysDark: false,
                                            surface: 'transcript',
                                        })}
                                        {sIdx < unit.sentences.length - 1 ? ' ' : ''}
                                    </span>
                                ))}
                            </span>
                            {(unitSaved || unitHasNote) && (
                                <span
                                    className="inline-flex items-center align-middle ml-1 text-accent/80"
                                    title={unitHasNote
                                        ? t('scriptReader.hasNoteBadge', { defaultValue: '已记笔记' })
                                        : t('scriptReader.savedToast', { defaultValue: '已收藏金句' })}
                                >
                                    {unitHasNote
                                        ? <NotebookPen className="h-3 w-3 inline" />
                                        : <Bookmark className="h-3 w-3 inline fill-current" />}
                                </span>
                            )}
                            {uIdx < logicalUnits.length - 1 ? ' ' : ''}
                        </span>
                    );
                })}
            </div>

            {/* 连贯中文译文流 */}
            {showTranslation && (
                <ScriptParagraphTranslationRow
                    sentences={block.sentences}
                    units={logicalUnits}
                    activeSentenceIndex={activeSentenceIndex}
                    searchQuery={searchQuery}
                    onSelectSentence={onSelectSentence}
                />
            )}

            {/* 有笔记时的极简边注提示 */}
            {annotatedInBlock.length > 0 && (
                <div className="flex flex-col gap-1 border-l-2 border-accent/35 pl-3 mt-0.5">
                    {annotatedInBlock.map((s) => {
                        const record = savedByKey.get(`${s.fileHash}:${s.index}`);
                        if (!record?.note?.trim()) return null;
                        return (
                            <button
                                key={`margin-${record.sentenceKey}`}
                                type="button"
                                onClick={() => onSelectSentence(s)}
                                className="text-left rounded-sm text-metadata text-secondary hover:text-primary transition-colors cursor-pointer line-clamp-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            >
                                {record.note}
                            </button>
                        );
                    })}
                </div>
            )}
        </article>
    );
}
