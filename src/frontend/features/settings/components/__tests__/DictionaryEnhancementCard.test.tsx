import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import '@/frontend/i18n';

import DictionaryEnhancementCard from '../DictionaryEnhancementCard';
import { englishDictionaryApi } from '@/frontend/features/settings/englishDictionaryApi';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import { DpTaskState } from '@/common/contracts/dp-task';

vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@/frontend/features/settings/englishDictionaryApi', () => ({
    englishDictionaryApi: {
        status: vi.fn(),
        install: vi.fn(),
        cancel: vi.fn(),
        remove: vi.fn(),
    },
}));

describe('DictionaryEnhancementCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useDpTaskCenter.setState({ tasks: new Map() });
    });

    it('任务在 register 返回前即已同步完成时，不残留下载中与陈旧 taskId', async () => {
        vi.mocked(englishDictionaryApi.status)
            .mockResolvedValueOnce({
                installed: false,
                downloading: false,
                downloadedBytes: 0,
                totalBytes: 0,
                error: null,
            })
            .mockResolvedValue({
                installed: true,
                downloading: false,
                downloadedBytes: 0,
                totalBytes: 0,
                error: null,
            });
        useDpTaskCenter.setState({
            tasks: new Map([
                [99, {
                    id: 99,
                    status: DpTaskState.DONE,
                    progress: 'done',
                    result: null,
                } as never],
            ]),
        });
        vi.mocked(englishDictionaryApi.install).mockResolvedValueOnce(99);

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <DictionaryEnhancementCard />
            </SWRConfig>,
        );

        const downloadBtn = await screen.findByRole('button', { name: /Download & setup|下载|resources\.pack\.itemDownload/i });
        fireEvent.click(downloadBtn);

        await waitFor(() => {
            expect(englishDictionaryApi.install).toHaveBeenCalledTimes(1);
        });
        expect(screen.queryByRole('button', { name: /Cancel|取消|resources\.pack\.cancel/i })).toBeNull();
    });
});
