import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { buildForceExitWatchdogCommand } from '@/backend/startup/forceExitWatchdog';

describe('buildForceExitWatchdogCommand', () => {
    it('Windows 下在 stdio: ignore 时不能使用 timeout /t，应等待指定秒数后再 taskkill', () => {
        const command = buildForceExitWatchdogCommand('win32', 4321, 8000);

        expect(command).not.toContain('timeout /t');
        expect(command).toContain('ping -n 9 127.0.0.1');
        expect(command).toContain('taskkill /f /t /pid 4321');
    });

    it('Unix 下先等待再清理直接子进程与主进程', () => {
        const command = buildForceExitWatchdogCommand('linux', 4321, 8000);

        expect(command).toContain('sleep 8;');
        expect(command).toContain('pgrep -P 4321');
        expect(command).toContain('kill -9 4321');
    });
});
