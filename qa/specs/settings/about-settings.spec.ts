import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

test.describe('关于与更新设置', () => {
    test('只有只读入口，页面里没有需要保存的输入项', async ({ session, settingsPage }) => {
        const page = session.page;
        await settingsPage.openSection('about', page.getByRole('heading', { name: '关于与更新' }));

        // 版本号来自后端，是这一页唯一的动态内容
        await expect(page.getByText(/^v\d+\.\d+\.\d+/).first()).toBeVisible();

        // 只读页的守卫：一旦误加了没有保存链路的输入控件，这条用例会失败。
        const main = page.getByRole('main');
        await expect(main).toBeVisible();
        await expect(main.getByRole('textbox')).toHaveCount(0);
        await expect(main.getByRole('combobox')).toHaveCount(0);
        await expect(main.getByRole('checkbox')).toHaveCount(0);
        await expect(main.getByRole('radio')).toHaveCount(0);
        await expect(main.getByRole('spinbutton')).toHaveCount(0);
    });
});
