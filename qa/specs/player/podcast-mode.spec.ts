import path from 'node:path';
import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { SENTENCE_CARD_TESTID } from '../../../src/common/constants/player-scroll-protocol';

const FIXTURE_VIDEO = path.resolve(__dirname, '..', '..', 'fixtures', 'media', 'qa-bilingual.mp4');

/**
 * 播客模式核心交互：
 * 进入播客模式后默认维持无侧栏全宽沉浸视图，支持通过顶部栏展开/收起字幕文稿与切换盲听遮罩，
 * 再次点击播客模式入口按钮退出后回到常规视频布局。
 */
test.describe('播客沉浸模式', () => {
    test('[SET-POD-01] 播放页切换播客模式后默认收起文稿并支持展开文稿与切换盲听模式', async ({ session }) => {
        const { page } = session;
        await page.setViewportSize({ width: 1440, height: 900 });

        await page.evaluate((file) => {
            window.location.hash = `#/player/qa?file=${encodeURIComponent(file)}&seek=0&lang=zh`;
        }, FIXTURE_VIDEO);

        await expect(page.getByTestId(SENTENCE_CARD_TESTID).first()).toBeVisible({ timeout: 30_000 });

        const enterPodcastButton = page.getByTestId('player-control-podcast-mode-button');
        await expect(enterPodcastButton).toBeAttached();
        // 窗口内控制条默认自动隐藏（pointer-events-none），先移入鼠标唤醒控制条再点击
        const buttonBox = await enterPodcastButton.boundingBox();
        if (!buttonBox) {
            throw new Error('播客模式按钮未返回布局框');
        }
        await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
        await expect(enterPodcastButton).toBeVisible();
        await enterPodcastButton.click();

        // 进入播客模式：顶部句序计数器出现，文稿侧栏默认收起
        await expect(page.getByTestId('podcast-sentence-counter')).toBeVisible();
        await expect(page.getByTestId('podcast-sentence-progress')).toBeVisible();

        const transcriptToggle = page.getByTestId('podcast-transcript-toggle');
        await expect(transcriptToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByTestId(SENTENCE_CARD_TESTID)).toHaveCount(0);

        // 在播客模式中按需展开文稿侧栏
        await transcriptToggle.click();
        await expect(transcriptToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId(SENTENCE_CARD_TESTID).first()).toBeVisible();

        // 切换盲听防剧透开关
        const blindToggle = page.getByTestId('podcast-blind-toggle');
        await expect(blindToggle).toHaveAttribute('aria-pressed', 'false');
        await blindToggle.click();
        await expect(blindToggle).toHaveAttribute('aria-pressed', 'true');

        // 退出播客模式，恢复常规视频分栏
        const exitPodcastButton = page.getByRole('button', { name: /退出播客|Exit podcast/i });
        await exitPodcastButton.click();
        await expect(page.getByTestId('podcast-sentence-counter')).toHaveCount(0);
        await expect(page.getByTestId(SENTENCE_CARD_TESTID).first()).toBeVisible();
    });
});
