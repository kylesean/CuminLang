import { History } from 'lucide-react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { cn } from '@/frontend/lib/utils';
import type { Sentence } from '@/common/types/SentenceC';
import TranslatableLineWrapper from './TranslatableLineWrapper';
import i18n from '@/frontend/i18n';

interface TranslatableLinePodcastParam {
    sentence: Sentence;
    adjusted: boolean;
    clearAdjust: () => void;
    className?: string;
}

/**
 * 播客模式下单句英文字幕渲染组件。
 * 保持文本居中占据完整阅读行宽；仅在该句存在时间微调时悬浮呈现重置入口。
 */
const TranslatableLinePodcast = ({
    sentence,
    adjusted,
    clearAdjust,
    className
}: TranslatableLinePodcastParam) => {
    const text = sentence.text;

    return text === undefined ? (
        <div />
    ) : (
        <div
            className={cn(
                'relative flex justify-center items-center w-full overflow-visible pointer-events-auto',
                className
            )}
        >
            {adjusted && (
                <div className="absolute -left-9 top-1/2 -translate-y-1/2 flex items-center justify-center">
                    <IconButton
                        label={i18n.t('player:subtitle.resetTimingTooltip')}
                        tooltip={i18n.t('player:subtitle.resetTimingTooltip')}
                        variant="ghost"
                        size="sm"
                        icon={<History className="w-4 h-4 stroke-[2]" />}
                        onClick={clearAdjust}
                    />
                </div>
            )}
            <TranslatableLineWrapper
                sentence={sentence}
            />
        </div>
    );
};

export default TranslatableLinePodcast;
