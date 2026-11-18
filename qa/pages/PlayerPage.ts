import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import {
    APP_SHELL_TESTIDS,
    WATCH_HISTORY_CARD_TESTID_PREFIX,
} from '../../src/common/constants/qa-testids';
import {
    SENTENCE_CARD_TESTID,
    SIDE_TRANSLATION_TOGGLE_TESTID,
} from '../../src/common/constants/player-scroll-protocol';

/** 公共双语媒体夹具路径（由 globalSetup 自动生成）。 */
export const QA_FIXTURE_VIDEO = path.resolve(__dirname, '..', 'fixtures', 'media', 'qa-bilingual.mp4');

/** 原生 `<video>` 元素的实时播放状态快照。 */
export interface VideoPlaybackState {
    readyState: number;
    paused: boolean;
    currentTime: number;
    duration: number;
    hasError: boolean;
}

/**
 * 播放器 Page Object：封装夹具入口、控制条唤醒、媒体状态读取与字幕/返回交互。
 */
export class PlayerPage {
    public constructor(public readonly page: Page) {}

    /** 通过 dev/qa 确定性入口打开双语夹具播放页。 */
    public async openFixture(options: { file?: string; seek?: number; lang?: 'zh' | 'en' } = {}): Promise<void> {
        const file = options.file ?? QA_FIXTURE_VIDEO;
        const seek = options.seek ?? 0;
        const lang = options.lang ?? 'zh';
        const hash = `#/player/qa?file=${encodeURIComponent(file)}&seek=${seek}&lang=${lang}`;
        await this.page.evaluate((target) => {
            window.location.hash = target;
        }, hash);
    }

    /** 字幕句卡定位器。 */
    public sentenceCards(): Locator {
        return this.page.getByTestId(SENTENCE_CARD_TESTID);
    }

    /** 侧栏译文开关定位器。 */
    public sideTranslationToggle(): Locator {
        return this.page.getByTestId(SIDE_TRANSLATION_TOGGLE_TESTID);
    }

    /** 最近观看卡片定位器（支持从首页重新进入播放器验证入库链路）。 */
    public historyCards(): Locator {
        return this.page.getByTestId(new RegExp(`^${WATCH_HISTORY_CARD_TESTID_PREFIX}`));
    }

    /** 移动指针唤醒默认自动隐退的播放器浮层控制条。 */
    public async wakeControls(): Promise<void> {
        await this.page.mouse.move(200, 200);
        await this.page.mouse.move(220, 220);
    }

    /** 读取页面内 `<video>` 的实际就绪与时间推进状态。 */
    public async readPlaybackState(): Promise<VideoPlaybackState> {
        return this.page.evaluate(() => {
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

    /** 等待 `<video>` 元数据与画面帧真正就绪。 */
    public async waitUntilVideoReady(timeout = 20_000): Promise<void> {
        await expect.poll(async () => {
            const state = await this.readPlaybackState();
            return !state.hasError && state.readyState >= 2 && state.duration > 0;
        }, { timeout }).toBe(true);
    }

    /** 唤醒控制条并点击播放或暂停按钮。 */
    public async clickTransportButton(action: 'play' | 'pause'): Promise<void> {
        await this.wakeControls();
        const pattern = action === 'play' ? /^(播放|Play)$/ : /^(暂停|Pause)$/;
        await this.page.getByRole('button', { name: pattern }).click();
    }

    /** 点击标题栏返回按钮回到上一页/首页。 */
    public async goBack(): Promise<void> {
        await this.page.getByTestId(APP_SHELL_TESTIDS.titleBarBack).click();
    }
}
