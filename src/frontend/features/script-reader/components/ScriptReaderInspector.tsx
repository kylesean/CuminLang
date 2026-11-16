import { useEffect, useState } from 'react';
import {
    Bookmark,
    BookOpenText,
    Check,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Gauge,
    NotebookPen,
    Pencil,
    Save,
    Square,
    Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import type {
    SavedSentenceTag,
    SavedSentenceVO,
} from '@/common/types/contextStudio';
import type { Sentence } from '@/common/types/SentenceC';
import type { SubtitleComprehensionVO } from '@/common/types/subtitleComprehension';
import TimeUtil from '@/common/utils/TimeUtil';
import StudyCopilotPane from '@/frontend/features/chat/components/StudyCopilotPane';
import type { SentenceBlock } from '@/frontend/features/player/lib/sentence-grouping';
import { playerApi } from '@/frontend/features/player/playerApi';
import { cn } from '@/frontend/lib/utils';
import { useReaderSentenceCopilot } from '../hooks/useReaderSentenceCopilot';

export interface UnitSaveContext {
    displayText: string;
    displayTextZh?: string;
    startTime: number;
    endTime: number;
}

interface ScriptReaderInspectorProps {
    videoId?: string;
    totalUnits: number;
    currentUnitOrder: number | null;
    allSentences: readonly Sentence[];
    activeUnit: SentenceBlock | null;
    savedRecord?: SavedSentenceVO;
    isSaved: boolean;
    isAudioPlayingHere: boolean;
    isEditingHere: boolean;
    onStepUnit: (delta: -1 | 1) => void;
    onPlaySingleUnit: (unit: SentenceBlock) => void;
    onStopAudio: () => void;
    onToggleSave: (sentence: Sentence, unitContext: UnitSaveContext) => void;
    onSaveNote: (sentence: Sentence, unitContext: UnitSaveContext, tag: SavedSentenceTag, note: string) => Promise<void>;
    onAppendNoteText: (sentence: Sentence, unitContext: UnitSaveContext, extraText: string, inferredTag?: SavedSentenceTag) => Promise<void>;
    onStartEdit: (sentence: Sentence) => void;
    onJumpToPlayer: (sentence: Sentence, withPractice: boolean) => void;
    onMarkWordKnown?: (word: string) => void;
    onJumpToSentenceIndex: (sentenceIndex: number) => void;
}

/**
 * 精读文稿右侧固定「精读案头」：
 * - 上半区（零 LLM 成本）：单句点读确认、原地校对、本地句法/生词诊断与标熟、标签笔记保存；
 * - 下半区（按需唤醒 AI 精读搭档）：以句子标识独立保活，保存笔记或收藏金句不会销毁 AI 会话。
 */
export function ScriptReaderInspector({
    videoId,
    totalUnits,
    currentUnitOrder,
    allSentences,
    activeUnit,
    savedRecord,
    isSaved,
    isAudioPlayingHere,
    isEditingHere,
    onStepUnit,
    onPlaySingleUnit,
    onStopAudio,
    onToggleSave,
    onSaveNote,
    onAppendNoteText,
    onStartEdit,
    onJumpToPlayer,
    onMarkWordKnown,
    onJumpToSentenceIndex,
}: ScriptReaderInspectorProps) {
    const { t } = useTranslation('pages');
    const sentence = activeUnit?.repr ?? null;

    return (
        <aside
            data-testid="script-reader-inspector"
            className="w-[380px] xl:w-[420px] shrink-0 border-l border-border/40 bg-surface/35 flex flex-col min-h-0"
        >
            {activeUnit && sentence ? (
                <InspectorActiveBody
                    key={`${sentence.fileHash}:${sentence.index}`}
                    videoId={videoId}
                    totalUnits={totalUnits}
                    currentUnitOrder={currentUnitOrder}
                    allSentences={allSentences}
                    activeUnit={activeUnit}
                    sentence={sentence}
                    savedRecord={savedRecord}
                    isSaved={isSaved}
                    isAudioPlayingHere={isAudioPlayingHere}
                    isEditingHere={isEditingHere}
                    onStepUnit={onStepUnit}
                    onPlaySingleUnit={onPlaySingleUnit}
                    onStopAudio={onStopAudio}
                    onToggleSave={onToggleSave}
                    onSaveNote={onSaveNote}
                    onAppendNoteText={onAppendNoteText}
                    onStartEdit={onStartEdit}
                    onJumpToPlayer={onJumpToPlayer}
                    onMarkWordKnown={onMarkWordKnown}
                    onJumpToSentenceIndex={onJumpToSentenceIndex}
                />
            ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-3">
                    <BookOpenText className="h-7 w-7 text-secondary/60" />
                    <Text type="body" weight="medium">
                        {t('scriptReader.inspectorIdleTitle', { defaultValue: '精读案头' })}
                    </Text>
                    <Text type="supporting" color="secondary" className="max-w-xs">
                        {t('scriptReader.inspectorIdleDesc', {
                            defaultValue: '点击左侧任意句子，在此查看词汇难点、记录批注笔记或按需向 AI 精读搭档提问。',
                        })}
                    </Text>
                </div>
            )}
        </aside>
    );
}

const OPTIONAL_NOTE_TAGS: readonly Exclude<SavedSentenceTag, 'general'>[] = [
    'expression',
    'grammar',
    'pronunciation',
];

function InspectorNoteEditor({
    sentence,
    unitContext,
    savedRecord,
    onSaveNote,
}: {
    sentence: Sentence;
    unitContext: UnitSaveContext;
    savedRecord?: SavedSentenceVO;
    onSaveNote: (sentence: Sentence, unitContext: UnitSaveContext, tag: SavedSentenceTag, note: string) => Promise<void>;
}) {
    const { t } = useTranslation('pages');
    const [tag, setTag] = useState<SavedSentenceTag>(savedRecord?.tag ?? 'general');
    const [note, setNote] = useState<string>(savedRecord?.note ?? '');
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const savedNoteText = savedRecord?.note?.trim() ?? '';
    const dirty = note !== (savedRecord?.note ?? '') || tag !== (savedRecord?.tag ?? 'general');

    const tagLabel = (value: Exclude<SavedSentenceTag, 'general'>) => (
        value === 'expression'
            ? t('contextStudio.tag.expression', { defaultValue: '地道表达' })
            : value === 'grammar'
                ? t('contextStudio.tag.grammar', { defaultValue: '长难句' })
                : t('contextStudio.tag.pronunciation', { defaultValue: '发音连读' })
    );

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSaveNote(sentence, unitContext, tag, note);
            setExpanded(false);
        } finally {
            setSaving(false);
        }
    };

    if (!expanded) {
        if (savedNoteText) {
            return (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="w-full text-left rounded-lg border border-border/40 bg-body/70 hover:bg-body px-3 py-2 flex items-start justify-between gap-2 transition-colors cursor-pointer"
                >
                    <div className="min-w-0 flex-1 flex items-start gap-2">
                        {savedRecord?.tag && savedRecord.tag !== 'general' && (
                            <span className="shrink-0 rounded bg-accent-bg/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                                {tagLabel(savedRecord.tag)}
                            </span>
                        )}
                        <span className="text-sm text-primary/90 line-clamp-2 break-words">
                            {savedNoteText}
                        </span>
                    </div>
                    <span className="shrink-0 text-metadata text-secondary hover:text-primary">
                        {t('scriptReader.editNoteTrigger', { defaultValue: '编辑' })}
                    </span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full h-8 px-2.5 rounded-lg border border-dashed border-border/55 bg-body/40 hover:bg-body/80 hover:border-border text-metadata text-secondary hover:text-primary flex items-center gap-2 transition-colors cursor-pointer"
            >
                <NotebookPen className="h-3.5 w-3.5 text-secondary shrink-0" />
                <span className="truncate">
                    {t('scriptReader.addNoteTrigger', { defaultValue: '记录笔记（连读、句法、搭配）...' })}
                </span>
            </button>
        );
    }

    return (
        <>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={t('scriptReader.notePlaceholder', {
                    defaultValue: '随手记下理解、搭配或句法笔记（保存后自动同步到语境工坊）...',
                })}
                className="w-full rounded-lg border border-border/50 bg-body px-3 py-2 text-sm text-primary placeholder:text-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    role="group"
                    aria-label={t('scriptReader.noteTagLabel', { defaultValue: '可选分类' })}
                    className="flex items-center gap-1 flex-wrap"
                >
                    {OPTIONAL_NOTE_TAGS.map((item) => {
                        const selected = tag === item;
                        return (
                            <button
                                key={item}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setTag(selected ? 'general' : item)}
                                className={cn(
                                    'px-2 py-0.5 rounded-md text-metadata border transition-colors cursor-pointer',
                                    selected
                                        ? 'border-accent/55 bg-accent-bg/15 text-accent font-medium'
                                        : 'border-border/45 bg-body/50 text-secondary hover:text-primary hover:border-border',
                                )}
                            >
                                {tagLabel(item)}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1">
                    {!dirty && (
                        <button
                            type="button"
                            onClick={() => setExpanded(false)}
                            className="px-2 py-1 rounded-md text-metadata text-secondary hover:text-primary hover:bg-muted/70 transition-colors cursor-pointer"
                        >
                            {t('scriptReader.collapseNote', { defaultValue: '收起' })}
                        </button>
                    )}
                    <Button
                        size="sm"
                        variant="primary"
                        icon={<Save className="h-3.5 w-3.5" />}
                        isDisabled={saving || (!dirty && Boolean(savedRecord))}
                        label={t('scriptReader.saveNote', { defaultValue: '保存笔记' })}
                        onClick={() => void handleSave()}
                    />
                </div>
            </div>
        </>
    );
}

function InspectorActiveBody({
    videoId,
    totalUnits,
    currentUnitOrder,
    allSentences,
    activeUnit,
    sentence,
    savedRecord,
    isSaved,
    isAudioPlayingHere,
    isEditingHere,
    onStepUnit,
    onPlaySingleUnit,
    onStopAudio,
    onToggleSave,
    onSaveNote,
    onAppendNoteText,
    onStartEdit,
    onJumpToPlayer,
    onMarkWordKnown,
    onJumpToSentenceIndex,
}: Omit<ScriptReaderInspectorProps, 'activeUnit'> & {
    activeUnit: SentenceBlock;
    sentence: Sentence;
}) {
    const { t } = useTranslation('pages');
    const [comprehension, setComprehension] = useState<SubtitleComprehensionVO | null>(null);

    const displayText = activeUnit.sentences.map((s) => s.text.trim()).filter(Boolean).join(' ');
    const displayTextZh = activeUnit.sentences.map((s) => s.textZH?.trim() || '').filter(Boolean).join('');
    const firstUnitSentence = activeUnit.sentences[0] ?? sentence;
    const lastUnitSentence = activeUnit.sentences[activeUnit.sentences.length - 1] ?? sentence;
    const unitContext: UnitSaveContext = {
        displayText,
        displayTextZh,
        startTime: firstUnitSentence.adjustedStart ?? firstUnitSentence.start,
        endTime: lastUnitSentence.adjustedEnd ?? lastUnitSentence.end,
    };

    const copilot = useReaderSentenceCopilot({
        videoId,
        activeSentence: sentence,
        focusedText: displayText,
        allSentences,
    });

    useEffect(() => {
        let cancelled = false;
        if (typeof playerApi.subtitleComprehension !== 'function' || !displayText) {
            return;
        }
        void playerApi
            .subtitleComprehension({
                text: displayText,
                fileHash: sentence.fileHash,
                sentenceIndex: sentence.index,
            })
            .then((res) => {
                if (!cancelled && res) {
                    setComprehension(res);
                }
            })
            .catch(() => {
                // 理解度分析属于本地增强信息，失败静默降级
            });
        return () => {
            cancelled = true;
        };
    }, [displayText, sentence.fileHash, sentence.index]);

    const startSec = sentence.adjustedStart ?? activeUnit.start;

    const difficultyLabel = comprehension
        ? comprehension.band === 'high'
            ? t('scriptReader.bandEasy', { defaultValue: '表达较直接' })
            : comprehension.band === 'medium'
                ? t('scriptReader.bandMedium', { defaultValue: '中等理解难度' })
                : t('scriptReader.bandHard', { defaultValue: '难点长句/生词较多' })
        : null;

    const orderLabel = currentUnitOrder !== null ? currentUnitOrder + 1 : sentence.index + 1;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* 顶部操作与定位条 */}
            <div className="px-4 py-2.5 border-b border-border/35 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1">
                    <Tooltip content={t('scriptReader.prevSentence', { defaultValue: '上一句' })} placement="below">
                        <button
                            type="button"
                            onClick={() => onStepUnit(-1)}
                            className="p-1 rounded-md text-secondary hover:text-primary hover:bg-muted/70 transition-colors cursor-pointer"
                            aria-label={t('scriptReader.prevSentence', { defaultValue: '上一句' })}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </Tooltip>
                    <span className="text-metadata font-mono text-secondary px-1">
                        #{orderLabel} / {totalUnits} · {TimeUtil.secondToTimeStrCompact(startSec)}
                    </span>
                    <Tooltip content={t('scriptReader.nextSentence', { defaultValue: '下一句' })} placement="below">
                        <button
                            type="button"
                            onClick={() => onStepUnit(1)}
                            className="p-1 rounded-md text-secondary hover:text-primary hover:bg-muted/70 transition-colors cursor-pointer"
                            aria-label={t('scriptReader.nextSentence', { defaultValue: '下一句' })}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </Tooltip>
                </div>

                <div className="flex items-center gap-1">
                    <Tooltip
                        content={
                            isAudioPlayingHere
                                ? t('scriptReader.stopSingleAudio', { defaultValue: '停止试听' })
                                : t('scriptReader.speakSentence', { defaultValue: '单句原声点读' })
                        }
                        placement="below"
                    >
                        <button
                            type="button"
                            data-testid="inspector-play-sentence"
                            onClick={() => (isAudioPlayingHere ? onStopAudio() : onPlaySingleUnit(activeUnit))}
                            className={cn(
                                'p-1.5 rounded-md transition-colors cursor-pointer',
                                isAudioPlayingHere
                                    ? 'text-accent bg-accent-bg/15'
                                    : 'text-secondary hover:text-primary hover:bg-muted/80',
                            )}
                            aria-label={
                                isAudioPlayingHere
                                    ? t('scriptReader.stopSingleAudio', { defaultValue: '停止试听' })
                                    : t('scriptReader.speakSentence', { defaultValue: '播放原声' })
                            }
                        >
                            {isAudioPlayingHere ? <Square className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                    </Tooltip>

                    <Tooltip content={t('scriptReader.proofreadSentence', { defaultValue: '校对原文（改词并保存 .edited.srt）' })} placement="below">
                        <button
                            type="button"
                            data-testid="inspector-proofread-btn"
                            onClick={() => onStartEdit(sentence)}
                            className={cn(
                                'p-1.5 rounded-md transition-colors cursor-pointer',
                                isEditingHere
                                    ? 'text-accent bg-accent-bg/15'
                                    : 'text-secondary hover:text-primary hover:bg-muted/80',
                            )}
                            aria-label={t('scriptReader.proofreadSentence', { defaultValue: '校对原文' })}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    </Tooltip>

                    <Tooltip
                        content={
                            isSaved
                                ? t('scriptReader.unsaveSentence', { defaultValue: '取消收藏' })
                                : t('scriptReader.saveSentence', { defaultValue: '收藏金句' })
                        }
                        placement="below"
                    >
                        <button
                            type="button"
                            onClick={() => onToggleSave(sentence, unitContext)}
                            className={cn(
                                'p-1.5 rounded-md transition-colors cursor-pointer',
                                isSaved
                                    ? 'text-accent bg-accent-bg/15'
                                    : 'text-secondary hover:text-primary hover:bg-muted/80',
                            )}
                            aria-label={
                                isSaved
                                    ? t('scriptReader.unsaveSentence', { defaultValue: '取消收藏' })
                                    : t('scriptReader.saveSentence', { defaultValue: '收藏金句' })
                            }
                        >
                            <Bookmark className={cn('h-3.5 w-3.5', isSaved && 'fill-current')} />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('scriptReader.locateInVideoShort', { defaultValue: '定位播放室' })} placement="below">
                        <button
                            type="button"
                            onClick={() => onJumpToPlayer(sentence, false)}
                            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-muted/80 transition-colors cursor-pointer"
                            aria-label={t('scriptReader.locateInVideoShort', { defaultValue: '定位画面' })}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* 上半区：完整句引用 + 句法诊断 + 待掌握词卡 + 个人批注 */}
            <div className="px-4 py-3 border-b border-border/35 flex flex-col gap-3 shrink-0" data-testid="script-note-drawer">
                <blockquote className="border-l-2 border-accent/60 pl-3 text-sm text-primary leading-relaxed select-text">
                    {displayText}
                </blockquote>

                {comprehension && difficultyLabel && (
                    <div className="flex flex-wrap items-center gap-1.5 text-metadata">
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-2 py-0.5 text-secondary">
                            <Gauge className="h-3.5 w-3.5 text-accent shrink-0" />
                            <span>{difficultyLabel}</span>
                        </span>
                        {comprehension.unknownWords.slice(0, 5).map((word) => (
                            <span
                                key={word}
                                className="inline-flex items-center gap-1 rounded-md border border-border/45 bg-body/80 px-1.5 py-0.5 text-primary"
                            >
                                <span>{word}</span>
                                {onMarkWordKnown && (
                                    <button
                                        type="button"
                                        onClick={() => onMarkWordKnown(word)}
                                        className="text-secondary hover:text-accent cursor-pointer"
                                        title={t('scriptReader.markKnown', { defaultValue: '标为已掌握' })}
                                        aria-label={t('scriptReader.markKnownWord', { defaultValue: `标熟 ${word}`, word })}
                                    >
                                        <Check className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        ))}
                    </div>
                )}

                <InspectorNoteEditor
                    key={`${sentence.fileHash}:${sentence.index}:${savedRecord?.tag ?? 'general'}:${savedRecord?.note ?? ''}`}
                    sentence={sentence}
                    unitContext={unitContext}
                    savedRecord={savedRecord}
                    onSaveNote={onSaveNote}
                />
            </div>

            {/* 下半区：按需唤醒的 AI 精读搭档 */}
            <div className="flex-1 min-h-0 flex flex-col">
                <StudyCopilotPane
                    compact
                    sentenceText={displayText}
                    messages={copilot.messageViews}
                    isBusy={copilot.isBusy}
                    sessionReady={copilot.sessionReady}
                    cloudAvailable={copilot.cloudAvailable}
                    chatErrorText={copilot.chatErrorText}
                    input={copilot.input}
                    onInputChange={copilot.setInput}
                    onSubmit={(val) => void copilot.handleSubmit(val)}
                    onStop={copilot.stop}
                    onClearConversation={copilot.clearConversation}
                    onPreviewSubtitleLine={(idx) => onJumpToSentenceIndex(idx)}
                    onAppendToNote={(takeaway) => {
                        const lastUserPrompt = [...copilot.messageViews]
                            .reverse()
                            .find((msg) => msg.role === 'user')
                            ?.blocks.map((b) => (b.kind === 'text' ? b.text : ''))
                            .join(' ') ?? '';
                        const inferredTag: SavedSentenceTag | undefined =
                            /核心表达|英文造句|替换说法/.test(lastUserPrompt)
                                ? 'expression'
                                : /长难句|句型|语法/.test(lastUserPrompt)
                                    ? 'grammar'
                                    : undefined;
                        void onAppendNoteText(sentence, unitContext, takeaway, inferredTag);
                    }}
                    attachedFocusExpr={copilot.attachedFocusExpr}
                    onClearFocusExpr={() => copilot.setAttachedFocusExpr(null)}
                    dictation={copilot.dictation}
                />
            </div>
        </div>
    );
}
