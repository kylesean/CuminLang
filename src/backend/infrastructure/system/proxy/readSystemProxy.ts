import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SystemProxyInfo {
    proxyUrl: string;
    noProxy: string[];
}

/**
 * 解析 macOS `scutil --proxy` 输出。
 *
 * 输出为类 plist 的嵌套结构，如：
 * ```
 * <dictionary> {
 *   ExceptionsList : <array> {
 *     0 : localhost
 *     1 : 127.0.0.1
 *   }
 *   HTTPEnable : 1
 *   HTTPProxy : 127.0.0.1
 *   HTTPPort : 7890
 * }
 * ```
 * 只读取 HTTP/HTTPS 代理；PAC 代理无法固化为单一 URL，返回 null。
 */
export const parseMacScutil = (output: string): SystemProxyInfo | null => {
    const values = new Map<string, string>();
    const exceptions: string[] = [];
    let inExceptions = false;

    for (const rawLine of output.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('ExceptionsList :')) {
            inExceptions = true;
            continue;
        }
        if (inExceptions) {
            if (line === '}') {
                inExceptions = false;
                continue;
            }
            const entry = line.replace(/^\d+\s*:\s*/, '').replace(/^"|"$/g, '').trim();
            if (entry) {
                exceptions.push(entry);
            }
            continue;
        }
        const match = line.match(/^(\S+)\s*:\s*(.*)$/);
        if (match) {
            values.set(match[1], match[2].replace(/^"|"$/g, ''));
        }
    }

    const httpEnabled = values.get('HTTPEnable') === '1';
    const httpsEnabled = values.get('HTTPSEnable') === '1';

    if (!httpEnabled && !httpsEnabled) {
        return null;
    }

    // 选择已启用的代理条目：HTTPS 优先（两者同时启用时端口通常一致），
    // 避免 HTTPS-only 配置下误用未启用的 HTTP 字段拼出 undefined:undefined。
    const server = httpsEnabled ? values.get('HTTPSProxy') ?? values.get('HTTPProxy') : values.get('HTTPProxy');
    const port = httpsEnabled ? values.get('HTTPSPort') ?? values.get('HTTPPort') : values.get('HTTPPort');

    if (!server || !port) {
        return null;
    }

    const proxyUrl = `http://${server}:${port}`;
    return { proxyUrl, noProxy: exceptions };
};

/** 解析 Windows `reg query` 输出，返回系统代理 URL 与例外列表。 */
export const parseWindowsReg = (output: string): SystemProxyInfo | null => {
    const values = new Map<string, string>();
    for (const rawLine of output.split('\n')) {
        const line = rawLine.trim();
        const match = line.match(/^\s*(\S+)\s+REG_\S+\s+(.*)$/);
        if (match) {
            values.set(match[1].toLowerCase(), match[2].trim().replace(/^"|"$/g, ''));
        }
    }

    const enabled = values.get('proxyenable') === '0x1';
    const proxyServer = values.get('proxyserver');
    if (!enabled || !proxyServer) {
        return null;
    }

    const separatorIndex = proxyServer.indexOf(';');
    let serverPart = separatorIndex >= 0 ? proxyServer.slice(0, separatorIndex) : proxyServer;
    // 处理 Windows 的多协议形式（http=host:port;https=host:port / socks=host:port），保留协议语义。
    const protocolPrefixMatch = serverPart.match(/^([a-zA-Z]+)=(.+)$/);
    let scheme = 'http';
    if (protocolPrefixMatch) {
        const prefix = protocolPrefixMatch[1].toLowerCase();
        scheme = prefix === 'socks' ? 'socks5' : prefix;
        serverPart = protocolPrefixMatch[2];
    }
    const proxyUrl = serverPart.includes('://') ? serverPart : `${scheme}://${serverPart}`;

    const noProxy = (values.get('proxyoverride') ?? '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean);

    return { proxyUrl, noProxy };
};

/** 应用启动时冻结操作系统注入的代理环境变量，避免 ProxyService 改写 process.env 后污染 system 模式检测。 */
const INITIAL_PROXY_ENV = {
    https_proxy: process.env.https_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    http_proxy: process.env.http_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    all_proxy: process.env.all_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
    no_proxy: process.env.no_proxy,
    NO_PROXY: process.env.NO_PROXY,
};

/** 从标准代理环境变量读取系统代理（Linux 桌面环境常用）。 */
const readFromEnv = (): SystemProxyInfo | null => {
    const proxyUrl = INITIAL_PROXY_ENV.https_proxy
        || INITIAL_PROXY_ENV.HTTPS_PROXY
        || INITIAL_PROXY_ENV.http_proxy
        || INITIAL_PROXY_ENV.HTTP_PROXY
        || INITIAL_PROXY_ENV.all_proxy
        || INITIAL_PROXY_ENV.ALL_PROXY;
    if (!proxyUrl) {
        return null;
    }
    const noProxy = (INITIAL_PROXY_ENV.no_proxy ?? INITIAL_PROXY_ENV.NO_PROXY ?? '')
        .split(/[;,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return { proxyUrl, noProxy };
};

/**
 * 读取操作系统级代理配置。
 *
 * 平台差异：
 * - macOS：执行 `scutil --proxy` 解析；
 * - Windows：执行 `reg query` 读取代理注册表项；
 * - Linux：读取 `*_PROXY` 环境变量。
 *
 * 无代理配置时返回 null；系统代理读取失败时抛出错误。
 */
export const readSystemProxy = async (): Promise<SystemProxyInfo | null> => {
    if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('scutil', ['--proxy']);
        return parseMacScutil(stdout);
    }
    if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('reg', [
            'query',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        ]);
        return parseWindowsReg(stdout);
    }
    return readFromEnv();
};
