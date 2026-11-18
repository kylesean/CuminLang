import { describe, expect, it } from 'vitest';

import { resolveProviderEndpointHost } from '@/common/constants/cloud-ai-provider-presets';

describe('resolveProviderEndpointHost', () => {
    it.each([
        ['https://api.deepseek.com/v1', 'api.deepseek.com'],
        ['https://api.example.com/v2/nested?x=1', 'api.example.com'],
        ['http://127.0.0.1:11434/v1', '127.0.0.1:11434'],
        ['http://192.168.1.25:8080/v1', '192.168.1.25:8080'],
    ])('提取 %s 的主机（含端口）为 %s', (endpoint, host) => {
        expect(resolveProviderEndpointHost(endpoint)).toBe(host);
    });

    it.each(['', '   ', 'not-a-url'])('无法解析的地址 %s 返回空串', (endpoint) => {
        expect(resolveProviderEndpointHost(endpoint)).toBe('');
    });

    it('同一主机的不同路径得到相同结果，不同主机则不同', () => {
        expect(resolveProviderEndpointHost('https://api.example.com/v1'))
            .toBe(resolveProviderEndpointHost('https://api.example.com/v2'));
        expect(resolveProviderEndpointHost('https://api.example.com/v1'))
            .not.toBe(resolveProviderEndpointHost('https://proxy.example.com/v1'));
    });
});
