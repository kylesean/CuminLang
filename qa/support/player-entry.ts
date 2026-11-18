import path from 'node:path';
import type { Page } from '@playwright/test';

/** 公共双语媒体夹具路径（由 globalSetup 自动生成）。 */
export const QA_FIXTURE_VIDEO = path.resolve(__dirname, '..', 'fixtures', 'media', 'qa-bilingual.mp4');

/**
 * 通过 dev/qa 确定性入口打开双语夹具播放页。
 *
 * @param page 应用主窗口页面。
 * @param options 可选 seek 秒数与语言（默认 seek=0，lang=zh）。
 */
export async function navigateToFixturePlayer(
    page: Page,
    options: { seek?: number; lang?: 'zh' | 'en' } = {},
): Promise<void> {
    const seek = options.seek ?? 0;
    const lang = options.lang ?? 'zh';
    const hash = `#/player/qa?file=${encodeURIComponent(QA_FIXTURE_VIDEO)}&seek=${seek}&lang=${lang}`;
    await page.evaluate((target) => {
        window.location.hash = target;
    }, hash);
}
