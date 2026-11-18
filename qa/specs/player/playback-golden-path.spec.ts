import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

/**
 * 核心播放链路（Canonical POM 示例）：
 * 入库 → 播放推进与暂停 → 字幕与侧栏译文切换 → 返回首页从「最近观看」重进播放器。
 *
 * 入库入口使用产品已有的 dev/qa `?file=`（与应用自己的 `watch-history/create` 同源），
 * 不伪造数据库；之后回到真实首页验证列表与播放器跨页衔接。
 */
test.describe('播放核心链路', () => {
    test('[SET-PLY-01] 入库后从最近观看进入播放页，视频可播放推进且字幕与侧栏译文可用 @smoke', async ({
        session,
        playerPage,
    }) => {
        const { page } = session;
        await playerPage.openFixture();

        const firstSentence = playerPage.sentenceCards().filter({ hasText: 'The player keeps' }).first();
        await expect(firstSentence).toBeVisible({ timeout: 30_000 });

        await playerPage.waitUntilVideoReady();

        const initialPlayback = await playerPage.readPlaybackState();
        if (initialPlayback.paused) {
            await playerPage.clickTransportButton('play');
        }
        await expect.poll(async () => {
            const state = await playerPage.readPlaybackState();
            return !state.paused && state.currentTime > initialPlayback.currentTime + 0.25;
        }, { timeout: 10_000 }).toBe(true);

        await playerPage.clickTransportButton('pause');
        await expect.poll(async () => (await playerPage.readPlaybackState()).paused, { timeout: 5_000 }).toBe(true);

        const translationToggle = playerPage.sideTranslationToggle();
        await expect(translationToggle).toBeVisible();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(firstSentence).toContainText('阅读位置');

        await translationToggle.click();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(firstSentence).not.toContainText('阅读位置');

        await translationToggle.click();
        await expect(translationToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(firstSentence).toContainText('阅读位置');

        await playerPage.goBack();
        const historyCard = playerPage.historyCards().first();
        await expect(historyCard).toBeVisible({ timeout: 15_000 });
        await expect(historyCard).toHaveAttribute('data-video-id', /.+/);
        const videoId = await historyCard.getAttribute('data-video-id');

        await historyCard.click();
        await expect(page).toHaveURL(new RegExp(`#/player/${videoId}`));
        await expect(playerPage.sentenceCards().first()).toBeVisible({ timeout: 30_000 });
        await playerPage.waitUntilVideoReady();
    });
});
