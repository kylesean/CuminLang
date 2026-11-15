import type { ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import {
    AudioLines,
    Bookmark,
    BookmarkCheck,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SplitHandle, SplitLayout, SplitPane } from '@/frontend/components/layout/SplitLayout';
import { cn } from '@/frontend/lib/utils';

export interface StudyWorkbenchShellProps {
    sentenceIndex: number | null;
    totalSentences: number;
    canStepPrev: boolean;
    canStepNext: boolean;
    onStepSentence: (delta: -1 | 1) => void;
    onJumpToPractice: () => void;
    isSentenceSaved: boolean;
    onToggleSaveSentence: () => void;
    leftCanvas: ReactNode;
    rightCopilot: ReactNode;
}

/**
 * 全窗整句精读工作台外壳（遵循 Astryx Toolbar / ghost chrome 规范，避免边框胶囊堆叠与重复返回按钮）。
 */
export default function StudyWorkbenchShell({
    sentenceIndex,
    totalSentences,
    canStepPrev,
    canStepNext,
    onStepSentence,
    onJumpToPractice,
    isSentenceSaved,
    onToggleSaveSentence,
    leftCanvas,
    rightCopilot,
}: StudyWorkbenchShellProps) {
    const { t } = useTranslation('common');

    return (
        <div
            data-testid="learning-workbench"
            className="flex h-full w-full flex-col overflow-hidden bg-body text-primary [--text-label-size:var(--text-supporting-size)] [--text-label-leading:var(--text-supporting-leading)]"
        >
            <div className="shrink-0 bg-surface/65 backdrop-blur-xl">
                <Toolbar
                    label={t('learning.title')}
                    size="sm"
                    gap={2}
                    variant="transparent"
                    dividers={['bottom']}
                    startContent={(
                        <HStack gap={0.5} vAlign="center">
                            <IconButton
                                label={t('learning.prevSentence')}
                                icon={<ChevronLeft className="h-3.5 w-3.5" />}
                                variant="ghost"
                                isDisabled={!canStepPrev}
                                onClick={() => onStepSentence(-1)}
                            />
                            <Text type="supporting" color="secondary" className="px-1 font-mono tabular-nums">
                                {sentenceIndex !== null && totalSentences > 0
                                    ? `${sentenceIndex + 1} / ${totalSentences}`
                                    : '-- / --'}
                            </Text>
                            <IconButton
                                label={t('learning.nextSentence')}
                                icon={<ChevronRight className="h-3.5 w-3.5" />}
                                variant="ghost"
                                isDisabled={!canStepNext}
                                onClick={() => onStepSentence(1)}
                            />
                        </HStack>
                    )}
                    endContent={(
                        <HStack gap={2} vAlign="center" className="no-drag">
                            <Button
                                label={isSentenceSaved ? t('learning.sentenceSavedToStudio') : t('learning.saveSentenceToStudio')}
                                variant={isSentenceSaved ? 'primary' : 'ghost'}
                                icon={isSentenceSaved
                                    ? <BookmarkCheck className="h-3.5 w-3.5" />
                                    : <Bookmark className="h-3.5 w-3.5" />}
                                onClick={onToggleSaveSentence}
                            />

                            <Button
                                label={t('learning.goToPracticeShort')}
                                variant="secondary"
                                icon={<AudioLines className="h-3.5 w-3.5 text-accent" />}
                                onClick={onJumpToPractice}
                            />
                        </HStack>
                    )}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                <SplitLayout direction="horizontal" className="h-full w-full">
                    <SplitPane defaultSize={44} minSize={30} className="min-w-0 h-full overflow-hidden">
                        {leftCanvas}
                    </SplitPane>
                    <SplitHandle
                        className={cn(
                            'group relative w-1.5 h-full flex items-center justify-center',
                            'bg-border/35 hover:bg-accent-bg/40 after:hidden transition-colors cursor-col-resize z-10',
                        )}
                    >
                        <div className="w-0.5 h-12 rounded-full bg-secondary/30 group-hover:bg-accent-bg group-hover:h-16 transition-all" />
                    </SplitHandle>
                    <SplitPane defaultSize={56} minSize={34} className="min-w-0 h-full overflow-hidden bg-surface/30">
                        {rightCopilot}
                    </SplitPane>
                </SplitLayout>
            </div>
        </div>
    );
}
