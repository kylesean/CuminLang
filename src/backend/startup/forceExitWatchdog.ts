import { spawn } from 'node:child_process';
import { getMainLogger } from '@/backend/infrastructure/logger';

const logger = getMainLogger('MainStartup');

/**
 * 退出兜底超时。
 *
 * 正常退出是秒级：本地模型子进程最多等 3s 自然退出，手机访问只是关监听。
 */
export const QUIT_FORCE_EXIT_TIMEOUT_MS = 8_000;

/**
 * 构造退出兜底看门狗的 shell 命令。
 *
 * @param platform 运行平台。
 * @param pid 需要终止的主进程 PID。
 * @param timeoutMs 超时毫秒数。
 * @returns 传给脱离子进程 shell 执行的命令字符串。
 */
export const buildForceExitWatchdogCommand = (
    platform: NodeJS.Platform,
    pid: number,
    timeoutMs: number = QUIT_FORCE_EXIT_TIMEOUT_MS,
): string => {
    const seconds = Math.ceil(timeoutMs / 1000);
    // Windows 的 timeout.exe 在 stdin 重定向（stdio: 'ignore'）时会直接报错退出，
    // 导致后续 & taskkill 0 秒立即执行；改用 ping -n (seconds+1) 次回环探测实现无 stdin 依赖的延时。
    return platform === 'win32'
        ? `ping -n ${seconds + 1} 127.0.0.1 >nul & taskkill /f /t /pid ${pid}`
        : `sleep ${seconds}; for child in $(pgrep -P ${pid}); do [ "$child" = "$$" ] || kill -9 "$child" 2>/dev/null; done; kill -9 ${pid} 2>/dev/null`;
};

/**
 * 部署退出兜底：超时后如果本进程还活着，从外部直接 SIGKILL。
 *
 * 为什么不用 JS 定时器：卡死发生在 Electron 关掉 JS 环境之后的清理阶段，那时定时器不会再跑。
 * 实测一个卡在文件读上的线程池请求（等一个没人点的 TCC 授权弹窗就会这样）能让 app.quit()、
 * app.exit(0) 甚至 process.exit(0) 全部退不掉，只有来自进程外的信号能把它杀掉，
 * 所以这里起一个脱离父进程的 shell 来收尾；正常退出时它醒来发现进程已经没了，自行结束。
 *
 * 硬杀必须连子进程一起：主进程被 SIGKILL 后，子进程会被 launchd 收养、继续卡在原来的读上
 * （实测漏了 5 个 ffprobe），所以先杀直接子进程再杀自己；Windows 用 taskkill /t 直接杀整棵进程树。
 */
export const armForceExitWatchdog = (): void => {
    const command = buildForceExitWatchdogCommand(process.platform, process.pid, QUIT_FORCE_EXIT_TIMEOUT_MS);
    const watchdog = spawn(command, {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    watchdog.on('error', (error) => {
        logger.warn('quit watchdog failed to start', { error });
    });
    watchdog.unref();
};
