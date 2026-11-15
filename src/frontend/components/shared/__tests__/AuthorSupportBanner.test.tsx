import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import '@/frontend/i18n';
import { AUTHOR_SUPPORT_CONTACT } from '@/common/constants/author-support';
import { settingsApi } from '@/frontend/features/settings/settingsApi';
import { AuthorSupportBanner } from '../AuthorSupportBanner';

vi.mock('@/frontend/features/settings/settingsApi', () => ({
    settingsApi: {
        copyText: vi.fn(),
    },
}));

vi.mock('react-hot-toast', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('AuthorSupportBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exhibits DouYin and Email contacts without legacy WeChat contact', () => {
        render(<AuthorSupportBanner suitableForLocalAi />);

        expect(screen.getByRole('button', { name: new RegExp(`DouYin.*${AUTHOR_SUPPORT_CONTACT.douyin}`) })).toBeDefined();
        expect(screen.getByRole('button', { name: new RegExp(`Email.*${AUTHOR_SUPPORT_CONTACT.email}`) })).toBeDefined();
        expect(screen.queryByText(/WeChat|Ky1eSean/)).toBeNull();
    });

    it.each([
        { label: 'DouYin', expectedValue: AUTHOR_SUPPORT_CONTACT.douyin },
        { label: 'Email', expectedValue: AUTHOR_SUPPORT_CONTACT.email },
    ])('copies $label contact via Electron IPC even when browser clipboard rejects', async ({ label, expectedValue }) => {
        const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        vi.mocked(settingsApi.copyText).mockResolvedValue(undefined);

        render(<AuthorSupportBanner />);

        fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

        await waitFor(() => {
            expect(settingsApi.copyText).toHaveBeenCalledWith(expectedValue);
            expect(toast.success).toHaveBeenCalledTimes(1);
        });
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('falls back to navigator.clipboard when Electron IPC copy fails', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        vi.mocked(settingsApi.copyText).mockRejectedValue(new Error('IPC unavailable'));

        render(<AuthorSupportBanner />);

        fireEvent.click(screen.getByRole('button', { name: /DouYin/ }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(AUTHOR_SUPPORT_CONTACT.douyin);
            expect(toast.success).toHaveBeenCalledTimes(1);
        });
    });
});
