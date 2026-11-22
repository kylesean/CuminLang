import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock, trackMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
    trackMock: vi.fn(),
}));

vi.mock('child_process', () => ({
    default: { spawn: spawnMock },
    spawn: spawnMock,
}));

vi.mock('@/backend/infrastructure/system/ActiveChildProcessRegistry', () => ({
    trackActiveChildProcess: trackMock,
}));

import { startCancelableCliProcess } from '@/backend/infrastructure/media/runCancelableCliProcess';

class FakeChildProcess extends EventEmitter {
    public pid = 4242;
    public stdout = new EventEmitter();
    public stderr = new EventEmitter();
    public kill = vi.fn();
}

describe('runCancelableCliProcess 显式子进程生命周期', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('取消时先发 SIGTERM，超时未退出再升级 SIGKILL；重复 cancel 不重复发信号', async () => {
        vi.useFakeTimers();
        const fakeChild = new FakeChildProcess();
        spawnMock.mockReturnValueOnce(fakeChild);

        const task = startCancelableCliProcess<string>(
            { executablePath: 'ffmpeg', args: ['-version'], graceKillMs: 500 },
            (ctx, resolve) => resolve(ctx.cancelled ? 'cancelled' : 'ok'),
        );

        expect(trackMock).toHaveBeenCalledWith(fakeChild);

        task.cancel();
        task.cancel();
        expect(fakeChild.kill).toHaveBeenCalledTimes(1);
        expect(fakeChild.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');

        vi.advanceTimersByTime(500);
        expect(fakeChild.kill).toHaveBeenCalledTimes(2);
        expect(fakeChild.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');

        fakeChild.emit('close', 137);
        await expect(task.result).resolves.toBe('cancelled');
    });

    it('SIGTERM 后若在宽限期内正常退出，清除定时器绝不再补发 SIGKILL', async () => {
        vi.useFakeTimers();
        const fakeChild = new FakeChildProcess();
        spawnMock.mockReturnValueOnce(fakeChild);

        const task = startCancelableCliProcess<string>(
            { executablePath: 'yt-dlp', args: ['--version'], graceKillMs: 500 },
            (ctx, resolve) => resolve(ctx.cancelled ? 'cancelled' : 'ok'),
        );

        task.cancel();
        expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');

        fakeChild.emit('close', 143);
        await expect(task.result).resolves.toBe('cancelled');

        vi.advanceTimersByTime(1000);
        expect(fakeChild.kill).toHaveBeenCalledTimes(1);
    });

    it('rejects cleanly when resolveOnClose throws synchronously', async () => {
        const fakeChild = new FakeChildProcess();
        spawnMock.mockReturnValueOnce(fakeChild);

        const task = startCancelableCliProcess<string>(
            { executablePath: 'yt-dlp', args: ['--ignore-errors'] },
            () => {
                throw new Error('output artifact missing');
            },
        );

        fakeChild.emit('close', 0);
        await expect(task.result).rejects.toThrow('output artifact missing');
    });
});
