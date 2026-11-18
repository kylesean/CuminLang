import net from 'node:net';
import { expect, type Page } from '@playwright/test';
import { readConfigValue, test } from '../../support/fixtures';
import { openSettingsSection, reloadSettingsPage } from '../../support/settings-page';
import { SETTING_ITEM_TESTIDS } from '../../../src/common/constants/qa-testids';

/**
 * 手机访问设置的用例。
 *
 * 这一页的产出是「一条带访问令牌的局域网地址」——令牌是这个功能的安全边界，
 * 所以用例直接用 HTTP 请求去戳服务，断言「没令牌进不去」「旧令牌立刻失效」，
 * 而不是只看界面上的文字。
 */

/** 设置中心侧边栏栏目键。 */
const SECTION_NAME = 'mobile' as const;

/** 启用开关的无障碍名。 */
const ENABLE_SWITCH_NAME = '启用手机访问';

/**
 * 进入手机访问设置页。
 *
 * @param page 应用主窗口页面。
 */
async function openMobileAccess(page: Page): Promise<void> {
    await openSettingsSection(page, SECTION_NAME, page.getByRole('switch', { name: ENABLE_SWITCH_NAME }));
}

/** 默认监听端口；若本机已有桌面端占用则自动退让到临时空闲端口。 */
const DEFAULT_MOBILE_PORT = 27182;

async function isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => {
            probe.close(() => resolve(true));
        });
        probe.listen(port);
    });
}

async function allocateFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            server.close(() => resolve(port));
        });
    });
}

/**
 * 打开手机访问服务，并等页面把访问地址列出来。
 *
 * @param page 应用主窗口页面。
 * @param userDataDir 用例隔离目录（用于确认退让端口先完成落盘，再触发开关）。
 */
async function enableMobileAccess(page: Page, userDataDir: string): Promise<void> {
    if (!(await isPortFree(DEFAULT_MOBILE_PORT))) {
        const freePort = await allocateFreePort();
        const portInput = page.getByRole('spinbutton', { name: '端口' });
        await portInput.fill(String(freePort));
        await portInput.blur();
        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.port')).toBe(String(freePort));
    }
    const toggle = page.getByRole('switch', { name: ENABLE_SWITCH_NAME });
    // Astryx 的 Switch 渲染成原生 checkbox，勾选状态在 checked 属性上而不是 aria-checked。
    if (!(await toggle.isChecked())) {
        await toggle.click();
    }
    // 地址区块要等服务真的起来才有内容，这里等第一条带令牌的地址出现。
    await expect(page.getByTestId(SETTING_ITEM_TESTIDS.mobileAccessUrl).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * 读取页面上展示的第一条访问地址。
 *
 * @param page 应用主窗口页面。
 * @returns 完整访问地址（含令牌）。
 */
async function readAccessUrl(page: Page): Promise<string> {
    const urlLocator = page.getByTestId(SETTING_ITEM_TESTIDS.mobileAccessUrl).first();
    await expect(urlLocator).toHaveText(/\S+/);
    return (await urlLocator.innerText()).trim();
}

/** 若宿主网络限制本机访问局域网接口 IP，回退到回环地址探测同一端口服务。 */
async function fetchServiceWithLoopbackFallback(rawUrl: string): Promise<Response> {
    try {
        return await fetch(rawUrl);
    } catch {
        const loopback = new URL(rawUrl);
        loopback.hostname = '127.0.0.1';
        return fetch(loopback.toString());
    }
}

test.describe('手机访问设置', () => {
    test('[SET-MOB-01] 开启后默认仅本机回环，切到局域网需确认明文 HTTP 风险且无令牌请求被拒绝', async ({ session, userDataDir }) => {
        const page = session.page;
        await openMobileAccess(page);
        await enableMobileAccess(page, userDataDir);
        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.enabled')).toBe('true');
        await expect(page.getByRole('radio', { name: '仅本机' })).toBeChecked();
        // storeSet 在值等于 schema 默认值 'loopback' 时不额外写盘，因此磁盘键可为 undefined 或 'loopback'
        expect(['loopback', undefined]).toContain(readConfigValue(userDataDir, 'mobileAccess.bindScope'));

        // 默认绑定仅本机回环，不向局域网暴露明文 HTTP
        const loopbackUrl = await readAccessUrl(page);
        expect(loopbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=/);

        // 切到局域网模式必须先确认明文 HTTP 风险弹窗；取消时不改变绑定范围
        await page.getByRole('radio', { name: '局域网' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await page.getByRole('button', { name: '保持仅本机' }).click();
        await expect(page.getByRole('radio', { name: '仅本机' })).toBeChecked();
        expect(['loopback', undefined]).toContain(readConfigValue(userDataDir, 'mobileAccess.bindScope'));

        await page.getByRole('radio', { name: '局域网' }).click();
        await page.getByRole('button', { name: '确认使用局域网' }).click();
        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.bindScope')).toBe('lan');
        await expect(page.getByText('局域网模式使用明文 HTTP')).toBeVisible();

        const accessUrl = await readAccessUrl(page);
        expect(accessUrl).toContain('?t=');
        const token = new URL(accessUrl).searchParams.get('t');
        expect(token).toBeTruthy();
        expect((token ?? '').length).toBeGreaterThanOrEqual(32);

        // 同一个地址去掉令牌就该进不去：这是这个功能的安全边界，
        // 只断言「地址里有令牌」证明不了服务真的在校验。
        const withoutToken = new URL(accessUrl);
        withoutToken.searchParams.delete('t');
        const anonymous = await fetchServiceWithLoopbackFallback(withoutToken.toString());
        expect(anonymous.status).toBe(401);

        // 带令牌的地址则要能正常打开手机页。
        const authorized = await fetchServiceWithLoopbackFallback(accessUrl);
        expect(authorized.status).toBe(200);

        // 重进页面：启用状态与访问地址来自后端回读
        await reloadSettingsPage(page, page.getByRole('switch', { name: ENABLE_SWITCH_NAME }));
        await expect(page.getByRole('switch', { name: ENABLE_SWITCH_NAME })).toBeChecked();
        await expect(page.getByTestId(SETTING_ITEM_TESTIDS.mobileAccessUrl).first()).toBeVisible();
    });

    test('[SET-MOB-02] 重新生成令牌后旧地址立刻失效，新地址可用', async ({ session, userDataDir }) => {
        const page = session.page;
        await openMobileAccess(page);
        await enableMobileAccess(page, userDataDir);

        const oldUrl = await readAccessUrl(page);
        const oldToken = new URL(oldUrl).searchParams.get('t');

        await page.getByRole('button', { name: '重新生成令牌' }).click();

        // 新令牌要落到配置里，并且与旧令牌不同。
        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.token')).not.toBe(oldToken);

        await page.getByRole('button', { name: '刷新' }).click();
        await expect.poll(async () => new URL(await readAccessUrl(page)).searchParams.get('t')).not.toBe(oldToken);
        const newUrl = await readAccessUrl(page);
        const newToken = new URL(newUrl).searchParams.get('t');
        expect(newToken).toBeTruthy();

        // 旧地址要真的打不开了，而不只是界面上换了个字符串。
        const stale = await fetchServiceWithLoopbackFallback(oldUrl);
        expect(stale.status).toBe(401);

        const fresh = await fetchServiceWithLoopbackFallback(newUrl);
        expect(fresh.status).toBe(200);
    });

    test('[SET-MOB-03] 关闭后不再展示访问地址', async ({ session, userDataDir }) => {
        const page = session.page;
        await openMobileAccess(page);
        await enableMobileAccess(page, userDataDir);
        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.enabled')).toBe('true');

        await page.getByRole('switch', { name: ENABLE_SWITCH_NAME }).click();

        await expect.poll(() => readConfigValue(userDataDir, 'mobileAccess.enabled')).toBe('false');
        // 关闭后地址区块应回到空态文案，不再列出任何带令牌的地址。
        await expect(page.getByText('开启服务后，这里会列出可以访问的地址。')).toBeVisible();
        await expect(page.getByTestId(SETTING_ITEM_TESTIDS.mobileAccessUrl)).toHaveCount(0);

        // 重进页面仍保持关闭态
        await reloadSettingsPage(page, page.getByRole('switch', { name: ENABLE_SWITCH_NAME }));
        await expect(page.getByRole('switch', { name: ENABLE_SWITCH_NAME })).not.toBeChecked();
        await expect(page.getByTestId(SETTING_ITEM_TESTIDS.mobileAccessUrl)).toHaveCount(0);
    });
});
