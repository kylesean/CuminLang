import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backendClient } from '@/frontend/infrastructure/electron/backendClient';
import { CANCEL_BY_USER_ERROR_NAME, isUserCancellation } from '@/common/utils/cancellation';

describe('backendClient IPC 错误解包', () => {
    const callMock = vi.fn();

    beforeEach(() => {
        callMock.mockReset();
        Object.defineProperty(window, 'electron', {
            value: {
                call: callMock,
            },
            configurable: true,
        });
    });

    it.each([
        [
            'youtube-import/start',
            "Error invoking remote method 'youtube-import/start': Error: 该视频正在导入中（任务 #2），请等待完成后重试",
            '该视频正在导入中（任务 #2），请等待完成后重试',
        ],
        [
            'system/open-folder/logs',
            "Error invoking remote method 'system/open-folder/logs': Error: No handler registered for 'system/open-folder/logs'",
            "No handler registered for 'system/open-folder/logs'",
        ],
        [
            'settings/storage/save',
            "Error invoking remote method 'settings/storage/save': CustomTypeError: 目录不可写",
            '目录不可写',
        ],
        [
            'system/app-version',
            'Plain business failure without electron prefix',
            'Plain business failure without electron prefix',
        ],
    ] as const)('路径 %s 抛错时剥离 Electron IPC 前缀: %s', async (path, rawMessage, expectedMessage) => {
        callMock.mockRejectedValueOnce(new Error(rawMessage));

        let caught: unknown;
        try {
            await backendClient.call(path as never, undefined as never);
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe(expectedMessage);
    });

    it('剥离前缀时保留用户取消错误类型以维持 isUserCancellation 语义', async () => {
        const ipcError = new Error(
            `Error invoking remote method 'youtube-import/start': ${CANCEL_BY_USER_ERROR_NAME}: caller aborted`,
        );
        callMock.mockRejectedValueOnce(ipcError);

        let caught: unknown;
        try {
            await backendClient.call('youtube-import/start', { url: 'https://www.youtube.com/watch?v=test' });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe('caller aborted');
        expect((caught as Error).name).toBe(CANCEL_BY_USER_ERROR_NAME);
        expect(isUserCancellation(caught)).toBe(true);
    });
});
