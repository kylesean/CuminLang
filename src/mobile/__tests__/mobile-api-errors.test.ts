import { afterEach, describe, expect, it, vi } from 'vitest';
import { mobileApi } from '@/mobile/api';

const setBrowserLang = (lang: string): void => {
    Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        value: lang,
    });
};

describe('mobileApi error localization', () => {
    const originalLanguage = window.navigator.language;

    afterEach(() => {
        vi.restoreAllMocks();
        setBrowserLang(originalLanguage);
    });

    it.each([
        ['en-US', '观看记录不存在：42', 'Watch history record not found: 42'],
        ['en-US', '词典 AI 模型未配置，请先在设置中完成模型配置', 'Dictionary AI model is not configured. Please configure it in Settings first.'],
        ['zh-CN', '观看记录不存在：42', '观看记录不存在：42'],
        ['en-US', 'Raw network failure', 'Raw network failure'],
    ] as const)('locale=%s 时把服务端错误 %s 映射为 %s', async (locale, serverError, expected) => {
        setBrowserLang(locale);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ error: serverError }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(mobileApi.getWatchDetail('42')).rejects.toThrow(expected);
    });

    it('throws when a 2xx response body is not valid JSON', async () => {
        setBrowserLang('zh-CN');
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response('<html>gateway error</html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            }),
        );

        await expect(mobileApi.getWatchDetail('42')).rejects.toThrow('服务器返回了无效响应');
    });
});
