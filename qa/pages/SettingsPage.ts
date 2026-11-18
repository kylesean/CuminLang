import { expect, type Locator, type Page } from '@playwright/test';
import {
    NAV_TESTIDS,
    SETTING_ROW_TESTIDS,
    SETTINGS_NAV_TESTIDS,
    type SettingRowKey,
    type SettingsSectionKey,
} from '../../src/common/constants/qa-testids';

/**
 * 设置中心 Page Object：收口栏目导航、行级下拉控件与自动保存回读语义。
 */
export class SettingsPage {
    public constructor(public readonly page: Page) {}

    /** 主区域内的错误提示（避开 `@astryxdesign/core` 全局隐藏 live-region `alert`）。 */
    public mainAlert(): Locator {
        return this.page.getByRole('main').getByRole('alert');
    }

    /** 从应用主导航进入设置中心并打开指定栏目。 */
    public async openSection(section: SettingsSectionKey, ready: Locator): Promise<void> {
        await this.page.getByTestId(NAV_TESTIDS.settings).click();
        await this.switchSection(section, ready);
    }

    /** 在设置中心内部直达切换到指定栏目（适合验证卸载/切换时防抖 flush）。 */
    public async switchSection(section: SettingsSectionKey, ready: Locator): Promise<void> {
        await this.page.getByTestId(SETTINGS_NAV_TESTIDS[section]).click();
        await expect(ready).toBeVisible();
    }

    /** 重载当前 HashRouter 设置页并等待标志元素回显，以确认值来自后端持久化。 */
    public async reload(ready: Locator): Promise<void> {
        await this.page.reload();
        await expect(ready).toBeVisible();
    }

    /** 定位指定设置行内的下拉选择触发器。 */
    public selectInRow(row: SettingRowKey): Locator {
        return this.page.getByTestId(SETTING_ROW_TESTIDS[row]).getByRole('combobox');
    }

    /** 点开指定设置行下拉框并选择可见文案项。 */
    public async chooseInRow(row: SettingRowKey, option: string): Promise<void> {
        const combobox = this.selectInRow(row);
        await combobox.scrollIntoViewIfNeeded();
        await combobox.click();
        await this.page.getByRole('option', { name: option }).click();
    }
}
