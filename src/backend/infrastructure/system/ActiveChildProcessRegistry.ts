import type { ChildProcess } from 'node:child_process';

const activeProcesses = new Set<ChildProcess>();

/**
 * 登记一个由主进程派生、且需在应用退出时统一中止的子进程。
 * 子进程在触发 `exit` 或 `close` 后会自动注销，避免长期驻留引用。
 *
 * @param child 已启动的子进程句柄。
 */
export function trackActiveChildProcess(child: ChildProcess): void {
    activeProcesses.add(child);
    const cleanup = () => {
        activeProcesses.delete(child);
    };
    child.once('exit', cleanup);
    child.once('close', cleanup);
}

/**
 * 在应用退出前向所有仍在运行的派生子进程发送终止信号。
 *
 * 注意：不依赖 `child.killed`（`kill('SIGTERM')` 会立即置位它），而是以从 Set 中
 * 注销或 `exitCode !== null` 判断进程是否仍在运行。
 */
export function terminateAllActiveChildProcesses(): void {
    for (const child of Array.from(activeProcesses)) {
        if (child.exitCode !== null || child.signalCode !== null) {
            activeProcesses.delete(child);
            continue;
        }
        try {
            child.kill('SIGTERM');
        } catch {
            // 进程可能在遍历间隙已退出，忽略 ESRCH 等瞬态错误。
        }
    }
}

/**
 * 仅供测试读取当前活跃子进程计数。
 */
export function getActiveChildProcessCount(): number {
    return activeProcesses.size;
}
