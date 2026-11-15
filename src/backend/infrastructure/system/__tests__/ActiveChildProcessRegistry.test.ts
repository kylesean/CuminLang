import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import {
    getActiveChildProcessCount,
    terminateAllActiveChildProcesses,
    trackActiveChildProcess,
} from '@/backend/infrastructure/system/ActiveChildProcessRegistry';

class FakeChildProcess extends EventEmitter {
    public exitCode: number | null = null;
    public signalCode: NodeJS.Signals | null = null;
    public kill = vi.fn(() => true);
}

describe('ActiveChildProcessRegistry', () => {
    it('tracks spawned children, sends SIGTERM on terminateAll, and removes exited processes', () => {
        const running = new FakeChildProcess();
        const alreadyExited = new FakeChildProcess();
        alreadyExited.exitCode = 0;

        trackActiveChildProcess(running as unknown as ChildProcess);
        trackActiveChildProcess(alreadyExited as unknown as ChildProcess);
        expect(getActiveChildProcessCount()).toBe(2);

        terminateAllActiveChildProcesses();
        expect(running.kill).toHaveBeenCalledWith('SIGTERM');
        expect(alreadyExited.kill).not.toHaveBeenCalled();

        running.emit('close', 0);
        expect(getActiveChildProcessCount()).toBe(0);
    });
});
