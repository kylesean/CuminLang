import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { APP_SHELL_TESTIDS, NAV_TESTIDS } from '../../../src/common/constants/qa-testids';

/**
 * 全局历史导航链路：首页 → 设置中心 → 语境工坊 → 后退 → 后退 → 前进。
 *
 * 验证左上角历史导航栏在不同一级模块间切换时可稳定记录访问栈，
 * 且后退/前进后真实视图内容正常渲染（不能只变 hash URL）。
 */
test.describe('全局历史导航', () => {
    test('[SET-NAV-01] 跨模块跳转后可通过标题栏后退返回上一页，并支持前进恢复', async ({ session }) => {
        const { page } = session;

        await page.getByTestId(NAV_TESTIDS.settings).click();
        await expect(page).toHaveURL(/#\/settings/);
        await expect(page.getByRole('heading', { name: '外观' })).toBeVisible();

        const backButton = page.getByTestId(APP_SHELL_TESTIDS.titleBarBack);
        await expect(backButton).toBeVisible();
        await expect(backButton).toBeEnabled();

        await page.getByTestId(NAV_TESTIDS.vocabulary).click();
        await expect(page).toHaveURL(/#\/context-studio/);

        // 从语境工坊后退回设置中心：URL 与页面真实内容都要恢复
        await backButton.click();
        await expect(page).toHaveURL(/#\/settings/);
        await expect(page.getByRole('heading', { name: '外观' })).toBeVisible();

        // 前进按钮在产生后退记录后可用
        const forwardButton = page.getByTestId(APP_SHELL_TESTIDS.titleBarForward);
        await expect(forwardButton).toBeVisible();
        await expect(forwardButton).toBeEnabled();

        // 继续后退回首页，再前进回设置中心
        await backButton.click();
        await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^(?:#\/)?$/);
        await expect(page.getByTestId(NAV_TESTIDS.settings)).toBeVisible();

        await forwardButton.click();
        await expect(page).toHaveURL(/#\/settings/);
        await expect(page.getByRole('heading', { name: '外观' })).toBeVisible();
    });
});
