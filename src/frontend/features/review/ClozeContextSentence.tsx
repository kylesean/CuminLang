import { splitClozeSegments } from '@/common/learning/cloze';

interface ClozeContextSentenceProps {
    text: string;
    targetWord: string;
    revealed: boolean;
}

/**
 * 共享语境填空渲染器：支持词形屈折（含不规则动词）及多词语块的挖空与答案高亮。
 */
export function ClozeContextSentence({ text, targetWord, revealed }: ClozeContextSentenceProps) {
    const segments = splitClozeSegments(text, targetWord);
    if (segments.every((segment) => !segment.matched)) {
        return <>{text}</>;
    }

    return (
        <>
            {segments.map((segment, idx) => {
                if (!segment.matched) {
                    return <span key={idx}>{segment.text}</span>;
                }
                if (!revealed) {
                    return (
                        <span
                            key={idx}
                            data-testid="review-cloze-blank"
                            className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded-md bg-muted border border-border/50 text-secondary font-medium select-none"
                        >
                            _____
                        </span>
                    );
                }
                return (
                    <span
                        key={idx}
                        data-testid="review-cloze-revealed"
                        className="font-semibold text-accent underline decoration-accent/50 underline-offset-4"
                    >
                        {segment.text}
                    </span>
                );
            })}
        </>
    );
}
