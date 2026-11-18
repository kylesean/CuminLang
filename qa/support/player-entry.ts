import type { Page } from '@playwright/test';
import { PlayerPage, QA_FIXTURE_VIDEO } from '../pages/PlayerPage';

export { QA_FIXTURE_VIDEO };

/** 兼容既有播放器用例导入；实现委托给 {@link PlayerPage.openFixture}。 */
export async function navigateToFixturePlayer(
    page: Page,
    options: { seek?: number; lang?: 'zh' | 'en' } = {},
): Promise<void> {
    await new PlayerPage(page).openFixture(options);
}
