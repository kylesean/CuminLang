import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandLogo } from '../BrandLogo';

describe('BrandLogo', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('dark', 'light');
    });

    it('renders lockup with integrated C mark and theme heading font without duplicating leading C', () => {
        const { container } = render(<BrandLogo variant="lockup" size="md" />);

        const logo = screen.getByRole('img', { name: 'CuminLang' });
        expect(logo.style.fontFamily).toBe('var(--font-family-heading)');
        expect(screen.getByText('uminLang')).toBeInTheDocument();
        expect(screen.queryByText('CuminLang')).not.toBeInTheDocument();
        expect(container.querySelectorAll('svg')).toHaveLength(1);
        expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    it('renders only the C mark SVG when variant is mark', () => {
        const { container } = render(<BrandLogo variant="mark" size="md" decorative />);

        expect(screen.queryByText('uminLang')).not.toBeInTheDocument();
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg?.getAttribute('class')).toContain('w-[var(--size-element-sm)]');
    });

    it.each([
        { variant: 'lockup' as const },
        { variant: 'mark' as const },
    ])('uses padded 20 28 214 200 viewBox in $variant mode so outer left C curve and seed are never clipped', ({ variant }) => {
        const { container } = render(<BrandLogo variant={variant} />);
        const svg = container.querySelector('svg');

        expect(svg).toHaveAttribute('viewBox', '20 28 214 200');
    });

    it.each([
        { themeClass: 'light', expectedFill: '#CE7818' },
        { themeClass: 'dark', expectedFill: '#E09428' },
    ])('adapts cumin seed accent color to $themeClass polarity', ({ themeClass, expectedFill }) => {
        document.documentElement.classList.add(themeClass);

        const { container } = render(<BrandLogo variant="lockup" />);
        const seed = container.querySelector('[data-brand-seed="true"]');

        expect(seed).toHaveAttribute('fill', expectedFill);
    });
});
