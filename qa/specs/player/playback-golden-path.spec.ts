import { expect, type Page } from '@playwright/test';
import { test } from '../../support/fixtures';
import { navigateToFixturePlayer } from '../../support/player-entry';
import {
    APP_SHELL_TESTIDS,
    WATCH_HISTORY_CARD_TESTID_PREFIX,
} from '../../../src/common/constants/qa-testids';
import {
    SENTENCE_CARD_TESTID,
    SIDE_TRANSLATION_TOGGLE_TESTID,
} from '../../../src/common/constants/player-scroll-protocol';

/**
 * 从页面读取原生 `<video>` 元素的当前加载与播放状态。
 *
 * @param page 应用主窗口页面。
 */
async function readVideoPlaybackState(page: Page): Promise<{
    readyState: number;
    paused: boolean;
    currentTime: number;
    duration: number;
    hasError: boolean;
}> {
    return page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>('video');
        if (!video) {
            return { readyState: 0, paused: true, currentTime: 0, duration: 0, hasError: true };
        }
        return {
            readyState: video.readyState,
            paused: video.paused,
            currentTime: video.currentTime,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            hasError: Boolean(video.error),
        };
    });
}

/**
 * 核心播放链路：入库 → 首页最近观看 → 播放页 → 字幕、侧栏译文与真实播放推进。
 *
 * 入库入口使用产品已有的 dev/qa `?file=`（与应用自己的 `watch-history/create` 同源），
 * 不伪造数据库；之后刻意回到真实首页，从「最近观看」卡片点进播放页，覆盖列表到播放器的
 * 跨页链路。滚动实验仍走 `?file=` 直达，不在这里重复。
 */
test.describe('播放核心链路', () => {
    test('[SET-PLY-01] 入库后从最近观看进入播放页，视频可播放推进且字幕与侧栏译文可用 @smoke', async ({ session }) => {
        const { page } = session;

        await navigateToFixturePlayer(page);

        const firstSentence = page.getByTestId(SENTENCE_CARD_TESTID).filter({ hasText: 'The player keeps' }).first();
        await expect(firstSentence).toBeVisible({ timeout: 30_000 });

        // 验证 <video> 真的就绪且播放推进，而不是卡在 canplay 静止画面
        await expect.poll(async () => {
            const state = await readVideoPlaybackState(page);
            return !state.hasError && state.readyState >= 2 && state.duration > 0;
        }, { timeout: 20_000 }).toBe(true);

        const initialPlayback = await readVideoPlaybackState(page);
        if (initialPlayback.paused) {
            // 播放器覆盖控制条默认在无鼠标活动 2.6s 后淡出为 pointer-events-none，先移动鼠标唤醒控制条
            await page.mouse.move(200, 200);
            await page.mouse.move(220, 220);
            await page.getByRole('button', { name: /^(播放|Play)$/ }).click();
        }
        await expect.poll(async () => {
            const state = await readVideoPlaybackState(page);
            return !state.paused && state.currentTime > initialPlayback.currentTime + 0.25;
        }, { timeout: 10_000 }).toBe(true);

        await page.mouse.move(200, 200);
        await page.mouse.move(220, 220);
        await page.getByRole('button', { name: /^(暂停|Pause)$/ }).click();
        await expect.poll(async () => (await readVideoPlaybackState(page)).paused, { timeout: 5_000 }).toBe(true);

        // 侧栏译文开关默认开启并展示 SRT 中文译文；验证关闭与重新开启都能实时生效
        const translationToggle = page.getByTestId(SIDE_TRANSLATION_TOGGLE_TESTID);
        await expect(translationToggle).toBeVisible();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(firstSentence).toContainText('阅读位置');

        await translationToggle.click();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(firstSentence).not.toContainText('阅读位置');

        await translationToggle.click();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(firstSentence).toContainText('阅读位置');

        // 通过标题栏返回首页：列表由 watch-history/list 提供，卡片 testid 带真实视频 ID
        await page.getByTestId(APP_SHELL_TESTIDS.titleBarBack).click();
        const historyCard = page.getByTestId(new RegExp(`^${WATCH_HISTORY_CARD_TESTID_PREFIX}`)).first();
        await expect(historyCard).toBeVisible({ timeout: 15_000 });
        const videoId = await historyCard.getAttribute('data-video-id');
        expect(videoId).toBeTruthy();

        await historyCard.click();
        await expect(page).toHaveURL(new RegExp(`#/player/${videoId}`));
        await expect(page.getByTestId(SENTENCE_CARD_TESTID).first()).toBeVisible({ timeout: 30_000 });
        await expect.poll(async () => {
            const state = await readVideoPlaybackState(page);
            return !state.hasError && state.readyState >= 2 && state.duration > 0;
        }, { timeout: 20_000 }).toBe(true);
    });
});
