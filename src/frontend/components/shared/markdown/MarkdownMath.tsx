import 'katex/dist/katex.min.css';
import { renderToString } from 'katex';
import React, { useMemo } from 'react';
import type { MarkdownComponents } from '@astryxdesign/core/Markdown';

type MarkdownMathProps = React.ComponentProps<NonNullable<MarkdownComponents['math']>>;

/**
 * Astryx `<Markdown components={{ math }}>` 的 KaTeX 数学公式渲染器。
 *
 * Astryx 默认关闭 `$...$` / `$$...$$` 数学解析，传入本组件即可启用内置 AST 数学节点，
 * 将大模型输出的 `$\rightarrow$`、`$\frac{a}{b}$` 等 LaTeX 表达渲染为标准排版。
 */
export const MarkdownMath: React.FC<MarkdownMathProps> = ({ value, display }) => {
    const html = useMemo(
        () => renderToString(value, {
            displayMode: display === 'block',
            throwOnError: false,
            strict: 'ignore',
        }),
        [value, display],
    );

    if (display === 'block') {
        return (
            <div
                className="my-2 overflow-x-auto py-0.5 text-center"
                data-testid="markdown-math-block"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        );
    }

    return (
        <span
            className="inline-block align-baseline"
            data-testid="markdown-math-inline"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};
