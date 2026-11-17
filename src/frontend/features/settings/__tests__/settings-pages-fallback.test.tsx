import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import '@/frontend/i18n';

import AppearanceSetting from '@/frontend/features/settings/AppearanceSetting';
import StorageSetting from '@/frontend/features/settings/StorageSetting';
import ShortcutSetting from '@/frontend/features/settings/ShortcutSetting';
import ServiceResourceSetting from '@/frontend/features/settings/ServiceResourceSetting';

const originalElectron = typeof window !== 'undefined' ? window.electron : undefined;

afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
        if (originalElectron === undefined) {
            delete (window as { electron?: unknown }).electron;
        } else {
            window.electron = originalElectron;
        }
    }
});

describe('设置页初始加载失败降级提示', () => {
    it.each([
        { name: 'AppearanceSetting', Component: AppearanceSetting },
        { name: 'StorageSetting', Component: StorageSetting },
        { name: 'ShortcutSetting', Component: ShortcutSetting },
        { name: 'ServiceResourceSetting', Component: ServiceResourceSetting },
    ])('$name 在后端接口加载失败时渲染错误 Banner 而不是无限停留在骨架屏', async ({ Component }) => {
        window.electron = {
            call: vi.fn().mockRejectedValue(new Error('IPC detail unavailable')),
            on: vi.fn(() => () => undefined),
        } as never;

        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
                    <Component />
                </SWRConfig>
            </MemoryRouter>,
        );

        const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
        expect(alert).toBeDefined();
        expect(alert.textContent).toContain('IPC detail unavailable');
    });
});
