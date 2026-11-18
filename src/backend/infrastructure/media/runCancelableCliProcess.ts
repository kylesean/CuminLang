import { ChildProcess, spawn } from 'child_process';
import { trackActiveChildProcess } from '@/backend/infrastructure/system/ActiveChildProcessRegistry';

type CliProcessPhase = 'running' | 'cancelling' | 'exited';

export interface CancelableCliRunOptions {
    executablePath: string;
    args: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    graceKillMs?: number;
    onSpawn?: (child: ChildProcess) => void;
    onStdoutChunk?: (text: string) => void;
    onStderrChunk?: (text: string) => void;
}

export interface CancelableCliCloseContext {
    code: number | null;
    exitCode: number;
    durationMs: number;
    cancelled: boolean;
    pid?: number;
}

/**
 * 启动并托管一个可优雅取消（`SIGTERM` → 超时升级 `SIGKILL`）的外部 CLI 子进程。
 *
 * 将原本散落在 FFmpeg / yt-dlp 执行器里的 `'running' | 'cancelling' | 'exited'`
 * 隐式状态机收敛到单一原语：
 * - 进程退出后自动清理 `sigkillTimer`，不留悬空句柄；
 * - 取消状态下绝不漏删或重复下发 `SIGKILL`；
 * - 统一向 {@link trackActiveChildProcess} 登记，保证应用退出可清场。
 */
export function startCancelableCliProcess<TResult>(
    options: CancelableCliRunOptions,
    resolveOnClose: (
        ctx: CancelableCliCloseContext,
        resolve: (value: TResult) => void,
        reject: (reason?: unknown) => void,
    ) => void,
): { result: Promise<TResult>; cancel: () => void } {
    const startedAt = Date.now();
    const graceKillMs = options.graceKillMs ?? 1200;
    let phase: CliProcessPhase = 'running';
    let processRef: ChildProcess | null = null;
    let sigkillTimer: NodeJS.Timeout | undefined;

    const clearTimer = (): void => {
        if (sigkillTimer) {
            clearTimeout(sigkillTimer);
            sigkillTimer = undefined;
        }
    };

    const result = new Promise<TResult>((resolve, reject) => {
        const child = spawn(options.executablePath, options.args, {
            cwd: options.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(options.env ? { env: options.env } : {}),
        });
        processRef = child;
        trackActiveChildProcess(child);
        options.onSpawn?.(child);

        child.stdout?.on('data', (chunk) => {
            options.onStdoutChunk?.(chunk.toString('utf8'));
        });
        child.stderr?.on('data', (chunk) => {
            options.onStderrChunk?.(chunk.toString('utf8'));
        });

        child.on('error', (error) => {
            phase = 'exited';
            processRef = null;
            clearTimer();
            reject(error);
        });

        child.on('close', (code) => {
            const cancelled = phase === 'cancelling';
            phase = 'exited';
            processRef = null;
            clearTimer();
            resolveOnClose(
                {
                    code,
                    exitCode: code ?? -1,
                    durationMs: Date.now() - startedAt,
                    cancelled,
                    pid: child.pid,
                },
                resolve,
                reject,
            );
        });
    });

    const cancel = (): void => {
        if (phase !== 'running') {
            return;
        }
        phase = 'cancelling';
        if (!processRef) {
            return;
        }
        processRef.kill('SIGTERM');
        sigkillTimer = setTimeout(() => {
            if (phase !== 'cancelling' || !processRef) {
                return;
            }
            processRef.kill('SIGKILL');
        }, graceKillMs);
    };

    return { result, cancel };
}
