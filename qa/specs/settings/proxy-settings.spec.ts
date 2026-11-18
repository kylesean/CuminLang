import { expect, type Page } from '@playwright/test';
import type { SettingsPage } from '../../pages/SettingsPage';
import { readConfigValue, test } from '../../support/fixtures';

/** 进入网络代理设置页。 */
async function openProxySetting(settingsPage: SettingsPage): Promise<void> {
    await settingsPage.openSection('proxy', settingsPage.page.getByRole('heading', { name: '网络代理' }));
}

/** 代理模式分段控件（SegmentedControl 渲染为 radiogroup）。 */
function proxyModeRadio(page: Page, label: string) {
    return page.getByRole('radiogroup', { name: '代理模式' }).getByRole('radio', { name: label });
}

function proxyUrlInput(page: Page) {
    return page.getByRole('textbox', { name: '代理地址' });
}

function bypassRulesInput(page: Page) {
    return page.getByRole('textbox', { name: '直连规则' });
}

/** 页面上填写的代理地址，故意与输入框占位符不同，便于区分「回显了」和「只是占位符」。 */
const PROXY_URL = 'http://127.0.0.1:7897';
/** 页面上填写的直连规则。 */
const BYPASS_RULES = 'localhost,127.0.0.1,*.e2e.test';

test.describe('网络代理设置', () => {
    test('切到自定义并填写代理地址与直连规则后落盘，重进页面仍回显', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const page = session.page;
        await openProxySetting(settingsPage);

        // 全新配置默认跟随系统，此时地址与规则不展示
        await expect(proxyModeRadio(page, '跟随系统')).toBeChecked();

        await proxyModeRadio(page, '自定义').click();

        await proxyUrlInput(page).fill(PROXY_URL);
        await bypassRulesInput(page).fill(BYPASS_RULES);

        // 设置页没有保存按钮，改动由页面防抖自动保存到配置文件
        await expect.poll(() => readConfigValue(userDataDir, 'proxy.mode')).toBe('custom');
        await expect.poll(() => readConfigValue(userDataDir, 'proxy.url')).toBe(PROXY_URL);
        await expect.poll(() => readConfigValue(userDataDir, 'proxy.bypass_rules')).toBe(BYPASS_RULES);

        // 重进页面：值来自后端回读，而不是页面里残留的输入
        await settingsPage.reload(page.getByRole('heading', { name: '网络代理' }));
        await expect(proxyModeRadio(page, '自定义')).toBeChecked();
        await expect(proxyUrlInput(page)).toHaveValue(PROXY_URL);
        await expect(bypassRulesInput(page)).toHaveValue(BYPASS_RULES);
    });

    test('切到不使用代理后模式落盘，重进页面仍回显且不再展示地址输入', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const page = session.page;
        await openProxySetting(settingsPage);

        await expect(proxyModeRadio(page, '跟随系统')).toBeChecked();

        await proxyModeRadio(page, '不使用').click();

        await expect.poll(() => readConfigValue(userDataDir, 'proxy.mode')).toBe('none');

        // 重进页面：模式来自后端回读，且该模式下没有可填写的代理地址
        await settingsPage.reload(page.getByRole('heading', { name: '网络代理' }));
        await expect(proxyModeRadio(page, '不使用')).toBeChecked();
        await expect(proxyUrlInput(page)).toHaveCount(0);
        await expect(bypassRulesInput(page)).toHaveCount(0);
    });

    test('改完立刻切到别的设置栏目，代理模式与地址仍会落盘并在重进后回显', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const page = session.page;
        await openProxySetting(settingsPage);

        await proxyModeRadio(page, '自定义').click();
        await proxyUrlInput(page).fill(PROXY_URL);

        // 关键：改完立刻离开，不给 600ms 防抖留时间。
        await settingsPage.switchSection('appearance', page.getByRole('radio', { name: '深色' }));

        await expect.poll(() => readConfigValue(userDataDir, 'proxy.mode')).toBe('custom');
        await expect.poll(() => readConfigValue(userDataDir, 'proxy.url')).toBe(PROXY_URL);

        // 回到该页：显示的是后端回读的值
        await settingsPage.switchSection('proxy', page.getByRole('heading', { name: '网络代理' }));
        await expect(proxyModeRadio(page, '自定义')).toBeChecked();
        await expect(proxyUrlInput(page)).toHaveValue(PROXY_URL);
    });

    test('自定义代理填写非法地址时显式提示校验错误，且不覆盖已保存的合法地址', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const page = session.page;
        await openProxySetting(settingsPage);

        await proxyModeRadio(page, '自定义').click();
        const urlInput = proxyUrlInput(page);
        await urlInput.fill(PROXY_URL);
        await expect.poll(() => readConfigValue(userDataDir, 'proxy.url')).toBe(PROXY_URL);

        // 改为缺少协议前缀的非法地址：页面应显式暴露错误，同时保留已落盘的合法代理地址
        await urlInput.fill('127.0.0.1:7890');

        const saveError = settingsPage.mainAlert();
        await expect(saveError).toBeVisible();
        await expect(saveError).toContainText('缺少协议前缀');
        expect(readConfigValue(userDataDir, 'proxy.url')).toBe(PROXY_URL);

        // 重进页面：界面回显的是真正存下来的合法地址，而非刚才的非法输入
        await settingsPage.reload(page.getByRole('heading', { name: '网络代理' }));
        await expect(proxyUrlInput(page)).toHaveValue(PROXY_URL);
    });
});
