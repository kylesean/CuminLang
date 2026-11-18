import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { SettingsPage } from '../../pages/SettingsPage';
import { readConfigValue, test } from '../../support/fixtures';

/** 进入存储管理设置页。 */
async function openStorageSetting(settingsPage: SettingsPage): Promise<void> {
    await settingsPage.openSection('storage', settingsPage.page.getByRole('heading', { name: '存储管理' }));
}

function libraryPathInput(page: Page) {
    return page.getByRole('textbox', { name: '存储路径（Library Path）' });
}

test.describe('存储设置', () => {
    test('改完媒体库路径后落盘，重进页面仍回显', async ({ session, settingsPage, userDataDir }) => {
        const page = session.page;
        await openStorageSetting(settingsPage);

        const libraryInput = libraryPathInput(page);
        // 用例独占目录里的媒体库路径由 fixture 预置，先确认界面回显的就是它
        const initialPath = path.join(userDataDir, 'library');
        await expect(libraryInput).toHaveValue(initialPath);

        // 先把目录建好，避免用例依赖后端对不存在目录的按需创建行为
        const nextPath = path.join(userDataDir, 'library-e2e');
        fs.mkdirSync(nextPath, { recursive: true });

        await libraryInput.fill(nextPath);

        await expect.poll(() => readConfigValue(userDataDir, 'storage.path')).toBe(nextPath);

        // 重进页面：路径来自后端回读，而不是页面里残留的输入
        await settingsPage.reload(page.getByRole('heading', { name: '存储管理' }));
        await expect(libraryPathInput(page)).toHaveValue(nextPath);
    });

    test('填了没有写权限的目录会显式报错，不落盘也不在页面上假装已保存', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const isRootUser = typeof process.getuid === 'function' && process.getuid() === 0;
        test.skip(
            process.platform === 'win32' || isRootUser,
            'Windows 与 Linux root（CAP_DAC_OVERRIDE）下 chmod 0o500 无法阻断目录写入',
        );
        const page = session.page;
        await openStorageSetting(settingsPage);

        const libraryInput = libraryPathInput(page);
        const initialPath = path.join(userDataDir, 'library');
        await expect(libraryInput).toHaveValue(initialPath);

        // 造一个用户确实可能选到的坏路径：父目录存在但没有写权限
        const readOnlyParent = path.join(userDataDir, 'read-only-parent');
        fs.mkdirSync(readOnlyParent);
        fs.chmodSync(readOnlyParent, 0o500);
        await libraryInput.fill(path.join(readOnlyParent, 'library'));

        // 保存失败必须让用户看见原因
        const saveError = settingsPage.mainAlert();
        await expect(saveError).toBeVisible();
        await expect(saveError).toContainText('当前存储目录暂时无法访问');
        expect(readConfigValue(userDataDir, 'storage.path')).toBe(initialPath);

        // 重进页面：界面回显的是真正存下来的旧路径，而不是刚才那段无效输入
        await settingsPage.reload(page.getByRole('heading', { name: '存储管理' }));
        await expect(libraryPathInput(page)).toHaveValue(initialPath);
    });

    test('改完媒体库路径立刻切到别的栏目，改动仍会落盘并在切回后回显', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const page = session.page;
        await openStorageSetting(settingsPage);

        const libraryInput = libraryPathInput(page);
        await expect(libraryInput).toHaveValue(path.join(userDataDir, 'library'));

        const nextPath = path.join(userDataDir, 'library-autosave');
        fs.mkdirSync(nextPath, { recursive: true });
        await libraryInput.fill(nextPath);

        // 卸载时自动提交挂起改动
        await settingsPage.switchSection('appearance', page.getByRole('radio', { name: '深色' }));
        await expect.poll(() => readConfigValue(userDataDir, 'storage.path')).toBe(nextPath);

        await settingsPage.switchSection('storage', page.getByRole('heading', { name: '存储管理' }));
        await expect(libraryPathInput(page)).toHaveValue(nextPath);
    });
});
