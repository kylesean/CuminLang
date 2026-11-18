import { expect } from '@playwright/test';
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
 * 核心播放链路：入库 → 首页最近观看 → 播放页 → 字幕与侧栏译文。
 *
 * 入库入口使用产品已有的 dev/qa `?file=`（与应用自己的 `watch-history/create` 同源），
 * 不伪造数据库；之后刻意回到真实首页，从「最近观看」卡片点进播放页，覆盖列表到播放器的
 * 跨页链路。滚动实验仍走 `?file=` 直达，不在这里重复。
 */
test.describe('播放核心链路', () => {
    test('[SET-PLY-01] 入库后从最近观看进入播放页，字幕与侧栏译文可用 @smoke', async ({ session }) => {
        const { page } = session;

        await navigateToFixturePlayer(page);

        const firstSentence = page.getByTestId(SENTENCE_CARD_TESTID).filter({ hasText: 'The player keeps' }).first();
        await expect(firstSentence).toBeVisible({ timeout: 30_000 });

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
    });
});
