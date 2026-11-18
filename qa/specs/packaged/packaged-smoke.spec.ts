import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { readPackagedConfigValue, test } from '../../support/packaged-fixtures';
import { SENTENCE_CARD_TESTID } from '../../../src/common/constants/player-scroll-protocol';

/** 媒体夹具：用来验证打包态忽略 `?file=` dev 入口。 */
const FIXTURE_VIDEO = path.resolve(__dirname, '..', '..', 'fixtures', 'media', 'qa-bilingual.mp4');

/**
 * 打包产物冒烟：ASAR、fuse、原生模块、extraResource 与 dev/prod 边界。
 *
 * 这一条只在 nightly / 手工 `pnpm run test:e2e:packaged` 跑；正式发布包关闭了
 * inspect fuse，Playwright 无法驱动，所以 QA 专用打包配置只打开这一个 fuse，
 * 其余安全配置与发布包一致。
 */
test.describe('打包产物', () => {
    test('打包应用在 NODE_ENV=development 下仍按生产态启动，ASAR/资源/设置链路可用', async ({
        session,
        settingsPage,
        userDataDir,
    }) => {
        const { app, page } = session;
        const runtime = await app.evaluate(({ app: electronApp }) => ({
            isPackaged: electronApp.isPackaged,
            resourcesPath: process.resourcesPath,
        }));
        expect(runtime.isPackaged).toBe(true);
        // macOS .app 内为 Contents/Resources，Windows/Linux 为 resources；
        // forge extraResource 把 ['resources', 'lib', 'drizzle'] 拷贝到 resourcesPath 下对应子目录
        expect(runtime.resourcesPath).toMatch(/[\\/]resources$/i);
        expect(fs.existsSync(path.join(runtime.resourcesPath, 'resources', 'dictionary.sqlite'))).toBe(true);
        expect(fs.existsSync(path.join(runtime.resourcesPath, 'drizzle', 'migrations'))).toBe(true);

        // NODE_ENV=development 不得把数据目录切回 dev 形态
        expect(fs.existsSync(path.join(userDataDir, 'data', 'dp_db.sqlite3'))).toBe(true);
        expect(fs.existsSync(path.join(userDataDir, 'data-dev'))).toBe(false);
        expect(fs.existsSync(path.join(userDataDir, 'config.dev.json'))).toBe(false);

        // main 进程明确报告非 devMode，且打包态忽略 ?file=、不暴露 __dpDebug
        const sysInfo = await page.evaluate(async () => {
            const handler = (window as unknown as {
                electron: { call: (route: string, param?: unknown) => Promise<{ devMode?: boolean }> };
            }).electron;
            return handler.call('system/info');
        });
        expect(sysInfo.devMode).toBe(false);

        await page.evaluate((file) => {
            window.location.hash = `#/player/qa?file=${encodeURIComponent(file)}&seek=0&lang=zh`;
        }, FIXTURE_VIDEO);
        await expect.poll(async () => {
            return page.evaluate(async () => {
                const handler = (window as unknown as {
                    electron: { call: (route: string, param?: unknown) => Promise<unknown[]> };
                }).electron;
                return handler.call('watch-history/list');
            });
        }).toHaveLength(0);
        expect(await page.evaluate(() => Boolean(
            (window as { __dpDebug?: unknown }).__dpDebug,
        ))).toBe(false);
        await expect(page.getByTestId(SENTENCE_CARD_TESTID)).toHaveCount(0);

        // 从未加载视频的播放页返回媒体库，回到主导航壳层再进入设置中心
        await page.getByRole('button', { name: '返回媒体库' }).click();

        // 验证打包态真实读写 config.json（不靠预置文件蒙混过关）
        await settingsPage.openSection(
            'appearance',
            page.getByRole('radiogroup', { name: '色彩模式' }).getByRole('radio', { name: '深色' }),
        );
        await page.getByRole('radiogroup', { name: '色彩模式' }).getByRole('radio', { name: '深色' }).click();
        await expect.poll(() => readPackagedConfigValue(userDataDir, 'appearance.theme')).toBe('dark');
        await settingsPage.reload(
            page.getByRole('radiogroup', { name: '色彩模式' }).getByRole('radio', { name: '深色' }),
        );
        await expect(page.getByRole('radiogroup', { name: '色彩模式' }).getByRole('radio', { name: '深色' })).toBeChecked();

        // 关于页与版本号链路可用（ASAR 内 renderer、preload、原生数据库模块均正常）
        await settingsPage.switchSection('about', page.getByRole('heading', { name: '关于与更新' }));
        await expect(page.getByRole('main').getByText(/^v\d+\.\d+\.\d+/).first()).toBeVisible();
    });
});
