import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../../support/fixtures';
import type { PlayerPage } from '../../pages/PlayerPage';
import { PLAYER_UI_TESTIDS, VOCAB_ANNOTATION_TESTIDS } from '../../../src/common/constants/qa-testids';

/**
 * 夹具字幕第一句中的内容词，且存在于默认词表。
 *
 * 默认词表以 `ignored` 播种，因此它同时覆盖两条规则：新用户不应看到下划线；
 * 用户显式加入生词后才实时出现。
 */
const TARGET_WORD = 'steady';

function mainSubtitleContent(page: Page): Locator {
    return page.getByTestId(PLAYER_UI_TESTIDS.mainSubtitleContent);
}

/** 打开播放器并等待第一句字幕及其词表匹配完成。 */
async function openFixture(playerPage: PlayerPage): Promise<void> {
    await playerPage.openFixture();
    const content = mainSubtitleContent(playerPage.page);
    await expect(content.getByText('The player keeps').first()).toBeVisible({ timeout: 30_000 });
    // 必须等到 matchSubtitleVocabulary IPC 返回并同步进 vocabularyStore，避免在 store 尚未填充时假通过
    await expect(content).toHaveAttribute('data-vocab-ready', 'true', { timeout: 30_000 });
}

/** 读取主字幕里目标词的注释元素。 */
function annotationOf(page: Page): Locator {
    return mainSubtitleContent(page)
        .getByTestId(VOCAB_ANNOTATION_TESTIDS.learning)
        .filter({ hasText: new RegExp(`^${TARGET_WORD}$`, 'i') })
        .first();
}

test.describe('词汇注释状态投影', () => {
    test('新用户不会因默认词表出现下划线', async ({ session, playerPage }) => {
        const { page } = session;
        await openFixture(playerPage);

        // steady 属于默认词表，播种状态是 ignored；词表匹配就绪后主字幕仍不应出现任何 learning 注释。
        await expect(mainSubtitleContent(page).getByTestId(VOCAB_ANNOTATION_TESTIDS.learning)).toHaveCount(0);
    });

    test('状态切换实时反映到主字幕下划线', async ({ session, playerPage }) => {
        const { page } = session;
        await openFixture(playerPage);

        const content = mainSubtitleContent(page);
        const wordButton = content.getByRole('button', { name: TARGET_WORD, exact: true }).first();

        // 1. 通过真实查词浮层收藏为生词：不刷新页面，主字幕下划线应实时出现
        await wordButton.click();
        const popover = page.getByRole('dialog', { name: TARGET_WORD });
        await expect(popover).toBeVisible();
        await popover.getByRole('button', { name: '收藏到语境工坊' }).click();
        await expect(annotationOf(page)).toHaveAttribute('data-vocab-annotation', 'learning');

        // 2. 重载页面后仍保持 learning 注释（验证真实落库与重新投影）
        await page.reload();
        await expect(content.getByText('The player keeps').first()).toBeVisible({ timeout: 30_000 });
        await expect(content).toHaveAttribute('data-vocab-ready', 'true', { timeout: 30_000 });
        await expect(annotationOf(page)).toHaveAttribute('data-vocab-annotation', 'learning');

        // 3. 通过查词浮层标记为已掌握：不刷新页面，下划线应实时消失；重载后仍保持消失
        await content.getByRole('button', { name: TARGET_WORD, exact: true }).first().click();
        const reopenedPopover = page.getByRole('dialog', { name: TARGET_WORD });
        await expect(reopenedPopover).toBeVisible();
        await reopenedPopover.getByRole('button', { name: '标记为已掌握' }).click();
        await expect(annotationOf(page)).toHaveCount(0);

        await page.reload();
        await expect(content.getByText('The player keeps').first()).toBeVisible({ timeout: 30_000 });
        await expect(content).toHaveAttribute('data-vocab-ready', 'true', { timeout: 30_000 });
        await expect(annotationOf(page)).toHaveCount(0);
    });
});
