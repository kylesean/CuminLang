export type ProxyUrlValidationCode =
    | 'empty'
    | 'missing_scheme'
    | 'unsupported_scheme'
    | 'invalid_url'
    | 'missing_host'
    | 'missing_socks_port'
    | 'invalid_port';

export type ProxyUrlValidationResult =
    | { valid: true; normalizedUrl: string }
    | { valid: false; code: ProxyUrlValidationCode; message: string };

const ALLOWED_PROXY_PROTOCOLS = new Set([
    'http:',
    'https:',
    'socks5:',
    'socks4:',
    'socks:',
]);

const SOCKS_PROTOCOLS = new Set(['socks5:', 'socks4:', 'socks:']);

/**
 * 校验自定义代理地址的 URL 语法与协议/主机/端口完整性。
 *
 * @param rawUrl 用户输入或传入的代理地址。
 * @returns 校验结果，失败时附带错误码与可读错误说明。
 */
export function validateCustomProxyUrl(rawUrl: string): ProxyUrlValidationResult {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
        return {
            valid: false,
            code: 'empty',
            message: '自定义代理地址不能为空',
        };
    }

    if (/\s/.test(trimmed)) {
        return {
            valid: false,
            code: 'invalid_url',
            message: '代理地址格式无效，不能包含空白字符',
        };
    }

    if (!trimmed.includes('://')) {
        return {
            valid: false,
            code: 'missing_scheme',
            message: '代理地址缺少协议前缀（例如 http://、https:// 或 socks5://）',
        };
    }

    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z\d+.-]*):\/\//);
    if (!schemeMatch) {
        return {
            valid: false,
            code: 'invalid_url',
            message: '代理地址格式无效',
        };
    }

    const protocol = `${schemeMatch[1].toLowerCase()}:`;
    if (!ALLOWED_PROXY_PROTOCOLS.has(protocol)) {
        return {
            valid: false,
            code: 'unsupported_scheme',
            message: '代理协议不受支持，仅支持 http://、https://、socks5:// 与 socks4://',
        };
    }

    // 校验 authority 尾部是否有空端口（例如 http://127.0.0.1:）
    const afterScheme = trimmed.slice(schemeMatch[0].length);
    const authority = afterScheme.split(/[/?#]/)[0] ?? '';
    const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
    if (!hostPort || hostPort.startsWith(':')) {
        return {
            valid: false,
            code: 'missing_host',
            message: '代理地址缺少主机名或 IP',
        };
    }
    if (hostPort.endsWith(':')) {
        return {
            valid: false,
            code: 'invalid_port',
            message: '代理端口格式无效（1–65535）',
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return {
            valid: false,
            code: 'invalid_url',
            message: '代理地址格式无效，请检查协议、主机与端口',
        };
    }

    if (!parsed.hostname) {
        return {
            valid: false,
            code: 'missing_host',
            message: '代理地址缺少主机名或 IP',
        };
    }

    if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
        return {
            valid: false,
            code: 'invalid_url',
            message: '代理地址不能包含路径、查询参数或锚点',
        };
    }

    if (parsed.port !== '') {
        const port = Number(parsed.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return {
                valid: false,
                code: 'invalid_port',
                message: '代理端口必须在 1–65535 之间',
            };
        }
    } else if (SOCKS_PROTOCOLS.has(protocol)) {
        return {
            valid: false,
            code: 'missing_socks_port',
            message: 'SOCKS 代理地址必须包含有效端口（例如 socks5://127.0.0.1:1080）',
        };
    }

    return {
        valid: true,
        normalizedUrl: trimmed,
    };
}
