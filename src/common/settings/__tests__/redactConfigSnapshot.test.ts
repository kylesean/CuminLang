import { describe, expect, it } from 'vitest';
import { redactConfigSnapshot } from '../redactConfigSnapshot';

describe('redactConfigSnapshot 配置快照脱敏', () => {
    it('将 electron-store 嵌套结构与扁平键下的全部明文凭据替换为长度占位符', () => {
        const snapshot = {
            apiKeys: {
                tencent: {
                    secretId: 'AKID_PLAIN_ID',
                    secretKey: 'SECRET_KEY_PLAIN',
                },
                openAi: {
                    providerKeys: '{"openai":"sk-live-secret"}',
                },
            },
            mobileAccess: {
                enabled: 'true',
                token: 'lan-bearer-token-value',
            },
            proxy: {
                mode: 'custom',
                url: 'http://alice:hunter2@127.0.0.1:7890',
            },
            appearance: {
                theme: 'dark',
            },
            'proxy.url': 'http://bob:pass@127.0.0.1:7891',
        };

        const redacted = redactConfigSnapshot(snapshot) as typeof snapshot;

        expect(redacted.apiKeys.tencent.secretId).toBe(`[redacted:${snapshot.apiKeys.tencent.secretId.length}]`);
        expect(redacted.apiKeys.tencent.secretKey).toBe(`[redacted:${snapshot.apiKeys.tencent.secretKey.length}]`);
        expect(redacted.apiKeys.openAi.providerKeys).toBe(`[redacted:${snapshot.apiKeys.openAi.providerKeys.length}]`);
        expect(redacted.mobileAccess.token).toBe(`[redacted:${snapshot.mobileAccess.token.length}]`);
        expect(redacted.proxy.url).toBe(`[redacted:${snapshot.proxy.url.length}]`);
        expect(redacted['proxy.url']).toBe(`[redacted:${snapshot['proxy.url'].length}]`);
        expect(redacted.mobileAccess.enabled).toBe('true');
        expect(redacted.proxy.mode).toBe('custom');
        expect(redacted.appearance.theme).toBe('dark');
        // 原对象不被原地篡改
        expect(snapshot.apiKeys.tencent.secretKey).toBe('SECRET_KEY_PLAIN');
    });

    it('保留已加密的 dp-enc: 前缀值与空串，且兼容非对象输入', () => {
        const snapshot = {
            apiKeys: {
                tencent: {
                    secretId: 'dp-enc:YWJj',
                    secretKey: '',
                },
            },
        };

        expect(redactConfigSnapshot(snapshot)).toEqual(snapshot);
        expect(redactConfigSnapshot(null)).toBeNull();
    });
});
