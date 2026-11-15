import React from 'react';
import { useIsDarkTheme } from '@/frontend/app/useIsDarkTheme';
import { cn } from '@/frontend/lib/utils';

const BRAND_SEED_COLOR = {
    light: '#CE7818',
    dark: '#E09428',
} as const;

/** 完整几何范围为 x: 24..229.28（C 圆心在 120,128 半径 96；果核最右 229.28）, y: 32..224；四周留足 ≥4px 安全边距避免抗锯齿裁切。 */
const BRAND_MARK_VIEWBOX = '20 28 214 200';
const BRAND_MARK_ARC_PATH = 'M 187.88 60.12 A 96 96 0 1 0 187.88 195.88 L 155.36 163.36 A 50 50 0 1 1 155.36 92.64 Z';
const BRAND_MARK_SEED_PATH = 'M 224.5 93.23 A 47 47 0 0 1 185.5 160.77 A 47 47 0 0 1 224.5 93.23 Z';

const SIZE_CLASSES = {
    mark: {
        sm: 'w-[1.5rem] h-[1.5rem]',
        md: 'w-[var(--size-element-sm)] h-[var(--size-element-sm)]',
        lg: 'w-[var(--size-element-lg)] h-[var(--size-element-lg)]',
    },
    lockup: {
        sm: 'text-lg',
        md: 'text-xl',
        lg: 'text-3xl',
    },
} as const;

export interface BrandLogoProps {
    /** `mark` 仅渲染孜然聚光 C 图形；`lockup` 将 C 图形作为首字母融入主题字体的 CuminLang 词组。 */
    variant?: 'mark' | 'lockup';
    /** 视觉尺度档位。 */
    size?: 'sm' | 'md' | 'lg';
    /** 作为纯装饰节点隐藏于辅助技术（当外层按钮已有完整 aria-label 时使用）。 */
    decorative?: boolean;
    /** 无障碍名称，默认 CuminLang。 */
    label?: string;
    className?: string;
}

const renderApertureSvg = (
    seedColor: string,
    className: string,
    a11yProps: React.SVGAttributes<SVGSVGElement>,
) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={BRAND_MARK_VIEWBOX}
        className={className}
        {...a11yProps}
    >
        <path fill="currentColor" d={BRAND_MARK_ARC_PATH} />
        <path fill={seedColor} data-brand-seed="true" d={BRAND_MARK_SEED_PATH} />
    </svg>
);

/**
 * CuminLang 品牌标志组件。
 *
 * - 主笔划与文字跟随 `currentColor`（由外层 `text-primary` 提供），天然适配全主题明暗极性。
 * - 孜然果核随极性切换为暖琥珀 `#CE7818`（浅色）或明藏红 `#E09428`（深色）。
 * - `lockup` 形态将 `C` 徽标直接作为首字母，后接跟随当前主题 `--font-family-heading` 的 `uminLang`。
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
    variant = 'lockup',
    size = 'md',
    decorative = false,
    label = 'CuminLang',
    className,
}) => {
    const isDark = useIsDarkTheme();
    const seedColor = isDark ? BRAND_SEED_COLOR.dark : BRAND_SEED_COLOR.light;

    const a11yProps = decorative
        ? { 'aria-hidden': true as const }
        : { role: 'img' as const, 'aria-label': label };

    if (variant === 'mark') {
        return renderApertureSvg(
            seedColor,
            cn('text-primary shrink-0', SIZE_CLASSES.mark[size], className),
            a11yProps,
        );
    }

    return (
        <span
            className={cn(
                'inline-flex items-baseline select-none text-primary font-semibold tracking-tight leading-none whitespace-nowrap shrink-0',
                SIZE_CLASSES.lockup[size],
                className,
            )}
            style={{ fontFamily: 'var(--font-family-heading)' }}
            {...a11yProps}
        >
            {renderApertureSvg(
                seedColor,
                'h-[0.84em] w-auto shrink-0 translate-y-[0.025em] mr-[0.015em]',
                { 'aria-hidden': true },
            )}
            <span aria-hidden={decorative ? undefined : true}>uminLang</span>
        </span>
    );
};
