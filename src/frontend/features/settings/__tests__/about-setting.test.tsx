import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { toast } from 'react-hot-toast';
import '@/frontend/i18n';
import { AUTHOR_SUPPORT_CONTACT } from '@/common/constants/author-support';
import AboutSetting from '../AboutSetting';
import { settingsApi } from '../settingsApi';

let mockSettingValues = new Map<string, string>([['appearance.theme', 'dark']]);

vi.mock('../settingsStore', () => ({
    // 桩只需覆盖被测组件读取的 values 字段；选择器签名在测试侧无跨模块校验，收紧为具体形状即可
    default: (selector: (state: { values: Map<string, string> }) => unknown) =>
        selector({ values: mockSettingValues }),
}));

vi.mock('../settingsApi', () => ({
    settingsApi: {
        getAppVersion: vi.fn(),
        checkUpdate: vi.fn(),
        openUrl: vi.fn(),
        openLogsFolder: vi.fn(),
        copyText: vi.fn(),
    },
}));

vi.mock('react-hot-toast', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const renderWithFreshSWR = (ui: React.ReactElement) => {
    return render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            {ui}
        </SWRConfig>
    );
};

describe('AboutSetting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSettingValues = new Map([['appearance.theme', 'dark']]);
        document.documentElement.classList.remove('dark', 'light');
    });

    it('renders app title and checks for updates in up-to-date state', async () => {
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.15.2');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({
            status: 'ok',
            releases: [],
        });

        renderWithFreshSWR(<AboutSetting />);

        expect(screen.getByRole('img', { name: 'CuminLang' })).toBeDefined();
        expect(await screen.findByText("You're up to date")).toBeDefined();
        expect(screen.getByRole('button', { name: /Check for Updates/ })).toBeDefined();
    });

    it('renders release changelog when a newer version is available', async () => {
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.15.2');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({
            status: 'ok',
            releases: [
                {
                    version: 'v0.16.0',
                    content: 'Added new features and bug fixes',
                    url: 'https://github.com/kylesean/CuminLang/releases/tag/v0.16.0',
                },
            ],
        });

        renderWithFreshSWR(<AboutSetting />);

        expect(await screen.findByText('Download New Release')).toBeDefined();
        expect(screen.getAllByText(/v0.16.0/).length).toBeGreaterThan(0);
    });

    it('triggers opening local diagnostic logs directory when clicked', async () => {
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.1.0');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({
            status: 'ok',
            releases: [],
        });
        vi.mocked(settingsApi.openLogsFolder).mockResolvedValue(undefined);

        renderWithFreshSWR(<AboutSetting />);

        const openLogsBtn = await screen.findByRole('button', { name: /Open Logs Folder|打开日志目录/ });
        fireEvent.click(openLogsBtn);

        expect(settingsApi.openLogsFolder).toHaveBeenCalledTimes(1);
    });

    it('prompts restart cleanly when logs handler is not registered in stale main process', async () => {
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.1.0');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({
            status: 'ok',
            releases: [],
        });
        vi.mocked(settingsApi.openLogsFolder).mockRejectedValue(
            new Error("Error invoking remote method 'system/open-folder/logs': Error: No handler registered for 'system/open-folder/logs'"),
        );

        renderWithFreshSWR(<AboutSetting />);

        const openLogsBtn = await screen.findByRole('button', { name: /Open Logs Folder|打开日志目录/ });
        fireEvent.click(openLogsBtn);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/restart CuminLang|重启 CuminLang/i));
        });
    });

    it('keeps support author section collapsed by default and expands QR codes on click', async () => {
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.1.0');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({
            status: 'ok',
            releases: [],
        });
        vi.mocked(settingsApi.copyText).mockResolvedValue(undefined);

        renderWithFreshSWR(<AboutSetting />);

        const supportToggle = await screen.findByRole('button', { name: /Support Author|支持作者/ });
        expect(supportToggle.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(supportToggle);

        expect(supportToggle.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByAltText(/WeChat Tip|微信赞赏/)).toBeDefined();
        expect(screen.getByAltText(/Follow on DouYin|关注抖音/)).toBeDefined();

        fireEvent.click(screen.getByRole('button', { name: /Copy DouYin ID|复制抖音号/ }));

        await waitFor(() => {
            expect(settingsApi.copyText).toHaveBeenCalledWith(AUTHOR_SUPPORT_CONTACT.douyin);
            expect(toast.success).toHaveBeenCalledTimes(1);
        });
    });

    it.each([
        { theme: 'light', themeFamily: 'neutral', rootClass: 'light', expectedSeed: '#CE7818' },
        { theme: 'dark', themeFamily: 'neutral', rootClass: 'dark', expectedSeed: '#E09428' },
        { theme: 'light', themeFamily: 'gothic', rootClass: 'light', expectedSeed: '#E09428' },
        { theme: 'system', themeFamily: 'neutral', rootClass: 'dark', expectedSeed: '#E09428' },
        { theme: 'system', themeFamily: 'neutral', rootClass: 'light', expectedSeed: '#CE7818' },
    ])(
        'adapts brand seed color for theme=$theme, family=$themeFamily, rootClass=$rootClass',
        async ({ theme, themeFamily, rootClass, expectedSeed }) => {
            mockSettingValues = new Map([
                ['appearance.theme', theme],
                ['appearance.themeFamily', themeFamily],
            ]);
            document.documentElement.classList.add(rootClass);
            vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.15.2');
            vi.mocked(settingsApi.checkUpdate).mockResolvedValue({ status: 'ok', releases: [] });

            renderWithFreshSWR(<AboutSetting />);

            const logo = await screen.findByRole('img', { name: 'CuminLang' });
            const seed = logo.querySelector('[data-brand-seed="true"]');
            expect(seed?.getAttribute('fill')).toBe(expectedSeed);
        },
    );

    it('updates brand seed color reactively when root dark class changes in system theme mode', async () => {
        mockSettingValues = new Map([
            ['appearance.theme', 'system'],
            ['appearance.themeFamily', 'neutral'],
        ]);
        document.documentElement.classList.add('light');
        vi.mocked(settingsApi.getAppVersion).mockResolvedValue('0.15.2');
        vi.mocked(settingsApi.checkUpdate).mockResolvedValue({ status: 'ok', releases: [] });

        renderWithFreshSWR(<AboutSetting />);

        const logo = await screen.findByRole('img', { name: 'CuminLang' });
        const seed = logo.querySelector('[data-brand-seed="true"]');
        expect(seed?.getAttribute('fill')).toBe('#CE7818');

        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');

        await waitFor(() => {
            expect(seed?.getAttribute('fill')).toBe('#E09428');
        });
    });
});
