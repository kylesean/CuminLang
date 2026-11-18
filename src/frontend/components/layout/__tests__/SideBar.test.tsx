import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/frontend/i18n';
import SideBar from '../SideBar';

vi.mock('@/frontend/features/player/playbackSessionStore', () => ({
    usePlaybackSession: () => ({
        currentId: null,
        hasEnteredPlayer: false,
    }),
}));

vi.mock('@/frontend/features/youtube-import/YoutubeImportSidebarItem', () => ({
    default: () => null,
}));

vi.mock('@/frontend/app/stores/layoutStore', () => ({
    default: (selector: (state: { sidebarCollapsed: boolean; toggleSidebar: () => void }) => unknown) =>
        selector({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));

vi.mock('@/frontend/features/file-browser/fileBrowserApi', () => ({
    fileBrowserApi: {
        getLastWatched: vi.fn().mockResolvedValue(null),
    },
}));

const renderSideBar = (compact: boolean) =>
    render(
        <MemoryRouter>
            <SideBar compact={compact} />
        </MemoryRouter>,
    );

describe('SideBar branding and alignment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.classList.remove('dark', 'light');
    });

    it('renders theme-adaptive integrated lockup without static logo images when expanded', () => {
        const { container } = renderSideBar(false);

        const textEl = screen.getByText('uminLang');
        expect(textEl.parentElement?.style.fontFamily).toBe('var(--font-family-heading)');
        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(screen.getByTestId('nav-home').closest('[class*="items-center"]')).toBeNull();
    });

    it('centers top C mark and compact nav item wrappers on the same icon column when collapsed', () => {
        const { container } = renderSideBar(true);

        expect(screen.queryByText('uminLang')).not.toBeInTheDocument();
        const homeNavItem = screen.getByTestId('nav-home');
        const listWrapper = homeNavItem.parentElement?.parentElement;
        expect(listWrapper?.className).toContain('[&>div]:items-center');

        const headerLogoButton = container.querySelector('button[aria-label="CuminLang"]');
        expect(headerLogoButton?.className).toContain('w-[var(--size-element-md)]');
        expect(headerLogoButton?.className).toContain('justify-center');
    });
});
