import type { Locator, Page } from '@playwright/test';
import type { SettingRowKey, SettingsSectionKey } from '../../src/common/constants/qa-testids';
import { SettingsPage } from '../pages/SettingsPage';

/** 兼容既有设置页用例导入；实现委托给 {@link SettingsPage}。 */
export async function openSettingsSection(page: Page, section: SettingsSectionKey, ready: Locator): Promise<void> {
    await new SettingsPage(page).openSection(section, ready);
}

export async function switchSettingsSection(page: Page, section: SettingsSectionKey, ready: Locator): Promise<void> {
    await new SettingsPage(page).switchSection(section, ready);
}

export async function reloadSettingsPage(page: Page, ready: Locator): Promise<void> {
    await new SettingsPage(page).reload(ready);
}

export function selectInRow(page: Page, row: SettingRowKey): Locator {
    return new SettingsPage(page).selectInRow(row);
}

export async function chooseInRow(page: Page, row: SettingRowKey, option: string): Promise<void> {
    await new SettingsPage(page).chooseInRow(row, option);
}
