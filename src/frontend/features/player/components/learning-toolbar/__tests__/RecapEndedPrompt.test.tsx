import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { buildLearningSessionKey } from '@/frontend/features/player/learningSessionStore';
import { useRecapPromptStore } from '../recapPromptStore';
import RecapEndedPrompt from '../RecapEndedPrompt';

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-i18next')>();
    return {
        ...actual,
        useTranslation: (ns?: string) => ({
            t: (key: string) => (ns ? `${ns}:${key}` : key),
        }),
    };
});

describe('RecapEndedPrompt', () => {
    beforeEach(() => {
        usePlaybackSession.setState({ videoId: 'video-1', srtHash: 'srt-1' });
        useRecapPromptStore.setState({ promptKey: null, recapOpen: false });
    });

    it('会话不匹配时不展示结束提示条', () => {
        useRecapPromptStore.setState({
            promptKey: buildLearningSessionKey('other-video', 'srt-1'),
        });

        render(<RecapEndedPrompt />);

        expect(screen.queryByTestId('recap-ended-prompt')).toBeNull();
    });

    it('展示轻量结束提示卡并支持主动作打开复盘与关闭隐藏', () => {
        const key = buildLearningSessionKey('video-1', 'srt-1');
        useRecapPromptStore.setState({ promptKey: key, recapOpen: false });

        render(<RecapEndedPrompt />);

        expect(screen.getByText('player:learningSummary.endedTitle')).toBeInTheDocument();
        expect(screen.getByText('player:learningSummary.endedHint')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'recap:cta' }));
        expect(useRecapPromptStore.getState().recapOpen).toBe(true);
        expect(useRecapPromptStore.getState().promptKey).toBeNull();

        act(() => {
            useRecapPromptStore.setState({ promptKey: key, recapOpen: false });
        });
        fireEvent.click(screen.getByRole('button', { name: 'player:learningSummary.endedDismiss' }));
        expect(useRecapPromptStore.getState().recapOpen).toBe(false);
        expect(useRecapPromptStore.getState().promptKey).toBeNull();
    });
});
