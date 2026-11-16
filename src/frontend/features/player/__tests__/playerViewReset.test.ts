import { beforeEach, describe, expect, it } from 'vitest';
import useLayout from '@/frontend/app/stores/layoutStore';
import usePracticePanel from '@/frontend/features/practice/practiceStore';
import {
    beginOverlayView,
    getBaseViewBeforeOverlay,
    resetPlayerOverlaysOnMediaReset,
} from '@/frontend/features/player/lib/player-view-sync';

describe('player-view-sync 切换视频时覆盖层清理', () => {
    beforeEach(() => {
        useLayout.setState({ podcastMode: false });
        usePracticePanel.setState({ visible: false, recorderPhase: 'idle' });
    });

    it('离开或切换视频时应关闭练习面板并清除播客底层视图记忆', () => {
        useLayout.setState({ podcastMode: true });
        beginOverlayView('practice', false);
        usePracticePanel.setState({ recorderPhase: 'requesting' });

        expect(usePracticePanel.getState().visible).toBe(true);
        expect(getBaseViewBeforeOverlay()).toBe('podcast');

        resetPlayerOverlaysOnMediaReset();

        expect(usePracticePanel.getState().visible).toBe(false);
        expect(usePracticePanel.getState().recorderPhase).toBe('idle');
        expect(getBaseViewBeforeOverlay()).toBe('play');
    });
});
