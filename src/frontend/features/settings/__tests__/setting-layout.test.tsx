import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { themes } from '@/astryx-themes';
import i18n from '@/frontend/i18n';
import SettingLayout from '@/frontend/features/settings/SettingLayout';
import { SETTINGS_NAV_TESTIDS, SETTINGS_SIDEBAR_TESTID } from '@/common/constants/qa-testids';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

describe('SettingLayout', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('zh-CN');
    });

    it('renders three semantic SideNav groups with appearance ordered first matching /settings default route', () => {
        render(
            <Theme theme={themes['dp-neutral']} mode="light">
                <LinkProvider component={({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>}>
                    <MemoryRouter initialEntries={['/settings/appearance']}>
                        <Routes>
                            <Route path="/settings" element={<SettingLayout />}>
                                <Route path="appearance" element={<div>appearance-page</div>} />
                            </Route>
                        </Routes>
                    </MemoryRouter>
                </LinkProvider>
            </Theme>,
        );

        const sidebar = screen.getByTestId(SETTINGS_SIDEBAR_TESTID);
        const groups = within(sidebar).getAllByRole('group');
        expect(groups).toHaveLength(3);

        expect(within(groups[0]).getByText('常用偏好')).toBeDefined();
        expect(within(groups[1]).getByText('能力与连接')).toBeDefined();
        expect(within(groups[2]).getByText('数据与系统')).toBeDefined();

        const navIds = within(sidebar)
            .getAllByRole('link')
            .map((el) => el.getAttribute('data-testid'));
        expect(navIds).toEqual([
            SETTINGS_NAV_TESTIDS.appearance,
            SETTINGS_NAV_TESTIDS.shortcut,
            SETTINGS_NAV_TESTIDS.resources,
            SETTINGS_NAV_TESTIDS.import,
            SETTINGS_NAV_TESTIDS.proxy,
            SETTINGS_NAV_TESTIDS.storage,
            SETTINGS_NAV_TESTIDS.mobile,
            SETTINGS_NAV_TESTIDS.about,
        ]);

        const appearanceNav = screen.getByTestId(SETTINGS_NAV_TESTIDS.appearance);
        expect(appearanceNav.getAttribute('aria-current')).toBe('page');
    });
});
