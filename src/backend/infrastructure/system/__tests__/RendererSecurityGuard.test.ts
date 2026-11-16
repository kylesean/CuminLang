import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { isAppPageUrl } from '@/backend/infrastructure/system/RendererSecurityGuard';

describe('RendererSecurityGuard.isAppPageUrl', () => {
    it('Windows 生产模式下应正确识别渲染器目录内的 file:// 页面路径', () => {
        const options = {
            rendererDirectory: 'C:\\Program Files\\CuminLang\\resources\\app.asar\\.vite\\renderer\\main_window',
        };

        expect(
            isAppPageUrl(
                'file:///C:/Program%20Files/CuminLang/resources/app.asar/.vite/renderer/main_window/index.html',
                options,
                'win32',
            ),
        ).toBe(true);
        expect(
            isAppPageUrl(
                'file:///C:/Users/Someone/evil.html',
                options,
                'win32',
            ),
        ).toBe(false);
    });

    it('POSIX 生产模式下正确区分目录内外页面', () => {
        const options = {
            rendererDirectory: '/opt/CuminLang/resources/app.asar/.vite/renderer/main_window',
        };

        expect(
            isAppPageUrl(
                'file:///opt/CuminLang/resources/app.asar/.vite/renderer/main_window/index.html',
                options,
                'linux',
            ),
        ).toBe(true);
        expect(
            isAppPageUrl(
                'file:///tmp/evil.html',
                options,
                'linux',
            ),
        ).toBe(false);
    });

    it('开发模式下严格按 origin 判定', () => {
        const options = { devServerUrl: 'http://localhost:5173' };

        expect(isAppPageUrl('http://localhost:5173/#/player/1', options)).toBe(true);
        expect(isAppPageUrl('https://evil.example.com', options)).toBe(false);
    });
});
