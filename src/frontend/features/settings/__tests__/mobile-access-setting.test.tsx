import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import MobileAccessSetting from '@/frontend/features/settings/MobileAccessSetting';

const DETAIL_KEY = 'settings/mobile-access/detail';
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

const renderPage = () =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MobileAccessSetting />
        </SWRConfig>,
    );

describe('MobileAccessSetting', () => {
    it('默认选中仅本机回环；切换局域网须经明文 HTTP 风险确认弹窗', async () => {
        const savedCalls: unknown[] = [];
        let detail = {
            enabled: true,
            port: 27182,
            bindScope: 'loopback',
            running: true,
            lanUrls: ['http://127.0.0.1:27182/?t=token_123456789012345678901234567890'],
            accessToken: 'token_123456789012345678901234567890',
            lastError: null,
        };

        window.electron = {
            call: vi.fn((path: string, params: unknown) => {
                if (path === DETAIL_KEY) {
                    return Promise.resolve(detail);
                }
                if (path === 'settings/mobile-access/save') {
                    savedCalls.push(params);
                    detail = { ...detail, ...(params as typeof detail) };
                    return Promise.resolve(undefined);
                }
                return Promise.resolve(undefined);
            }),
        } as never;

        renderPage();

        const group = await screen.findByRole('radiogroup', { name: 'mobile.scopeTitle' }, { timeout: 3000 });
        expect(within(group).getByRole('radio', { name: 'mobile.scopeLoopback' })).toBeChecked();
        expect(screen.queryByText('mobile.plaintextWarningTitle')).toBeNull();

        fireEvent.click(within(group).getByRole('radio', { name: 'mobile.scopeLan' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText('mobile.lanConfirmTitle')).toBeDefined();

        // 取消时保持 loopback，不保存 lan
        fireEvent.click(within(dialog).getByRole('button', { name: 'mobile.lanConfirmCancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(within(group).getByRole('radio', { name: 'mobile.scopeLoopback' })).toBeChecked();
        expect(savedCalls).toHaveLength(0);

        // 确认后切到 lan，自动保存并显示明文 HTTP 警告
        fireEvent.click(within(group).getByRole('radio', { name: 'mobile.scopeLan' }));
        const confirmDialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(confirmDialog).getByRole('button', { name: 'mobile.lanConfirmOk' }));

        await waitFor(() => expect(savedCalls).toHaveLength(1), { timeout: 3000 });
        expect(savedCalls[0]).toEqual({
            enabled: true,
            port: 27182,
            bindScope: 'lan',
        });
        expect(await screen.findByText('mobile.plaintextWarningTitle')).toBeDefined();
    });
});
