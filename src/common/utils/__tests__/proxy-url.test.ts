import { describe, expect, it } from 'vitest';
import { validateCustomProxyUrl, type ProxyUrlValidationCode } from '@/common/utils/proxy-url';

describe('validateCustomProxyUrl', () => {
    it.each([
        ['http://127.0.0.1:7890', 'http://127.0.0.1:7890'],
        ['https://proxy.example.com:8443', 'https://proxy.example.com:8443'],
        ['http://proxy.example.com', 'http://proxy.example.com'],
        ['http://user:pass@127.0.0.1:7890', 'http://user:pass@127.0.0.1:7890'],
        ['http://[::1]:7890', 'http://[::1]:7890'],
        ['socks5://127.0.0.1:1080', 'socks5://127.0.0.1:1080'],
        ['socks4://127.0.0.1:1080', 'socks4://127.0.0.1:1080'],
        ['socks5://user:pass@127.0.0.1:1080', 'socks5://user:pass@127.0.0.1:1080'],
        ['  http://127.0.0.1:7890/  ', 'http://127.0.0.1:7890/'],
    ])('接受合法代理地址 %s', (input, expectedNormalized) => {
        expect(validateCustomProxyUrl(input)).toEqual({
            valid: true,
            normalizedUrl: expectedNormalized,
        });
    });

    it.each<[string, ProxyUrlValidationCode]>([
        ['', 'empty'],
        ['   ', 'empty'],
        ['127.0.0.1:7890', 'missing_scheme'],
        ['localhost:7890', 'missing_scheme'],
        ['ftp://127.0.0.1:21', 'unsupported_scheme'],
        ['ws://127.0.0.1:8080', 'unsupported_scheme'],
        ['http://', 'missing_host'],
        ['http://:7890', 'missing_host'],
        ['socks5://:1080', 'missing_host'],
        ['socks5://127.0.0.1', 'missing_socks_port'],
        ['socks4://proxy.local', 'missing_socks_port'],
        ['http://127.0.0.1:0', 'invalid_port'],
        ['http://127.0.0.1:', 'invalid_port'],
        ['http://127.0.0.1:99999', 'invalid_url'],
        ['http://127.0.0.1:7890/path', 'invalid_url'],
        ['http://127.0.0.1:7890?a=1', 'invalid_url'],
        ['http://bad host:7890', 'invalid_url'],
    ])('拒绝非法代理地址 %s（错误码 %s）', (input, expectedCode) => {
        const result = validateCustomProxyUrl(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.code).toBe(expectedCode);
            expect(result.message.length).toBeGreaterThan(0);
        }
    });
});
