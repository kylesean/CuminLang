import { describe, expect, it } from 'vitest';
import {
    proxySettingSaveSchema,
    runtimeSettingSaveSchema,
} from '@/backend/controllers/ipc/routeSchemas';
import type { RuntimeWritableSettingKey } from '@/common/contracts/runtime-settings';

const ALL_RUNTIME_WRITABLE_KEYS: RuntimeWritableSettingKey[] = [
    'appearance.theme',
    'appearance.themeFamily',
    'appearance.transcriptPosition',
    'player.autoPlayNext',
    'player.pauseOnWordHover',
    'player.vocabularyGuidance',
    'player.adaptiveChinese',
    'player.sceneCues',
    'subtitle.autoRefineWithLocalAsr',
    'userSelect.playbackRateStack',
    'providers.embedding',
    'learning.activePromptPresetId',
];

describe('IPC routeSchemas 校验契约', () => {
    it.each(ALL_RUNTIME_WRITABLE_KEYS)(
        'runtimeSettingSaveSchema 允许所有 RuntimeWritableSettingKey：%s',
        (key) => {
            const parsed = runtimeSettingSaveSchema.safeParse({ key, value: 'test-value' });
            expect(parsed.success).toBe(true);
        },
    );

    it('runtimeSettingSaveSchema 拒绝未知设置键', () => {
        const parsed = runtimeSettingSaveSchema.safeParse({
            key: 'apiKeys.openAi.key',
            value: 'sk-test',
        });
        expect(parsed.success).toBe(false);
    });

    it.each([
        { mode: 'custom' as const, url: 'http://127.0.0.1:7890', bypassRules: '' },
        { mode: 'custom' as const, url: 'socks5://127.0.0.1:1080', bypassRules: 'localhost' },
        { mode: 'custom' as const, url: '', bypassRules: '' },
        { mode: 'system' as const, url: '127.0.0.1:7890', bypassRules: '' },
        { mode: 'none' as const, url: 'not-a-url', bypassRules: '' },
    ])('proxySettingSaveSchema 放行合法或非 custom 模式输入 %o', (payload) => {
        expect(proxySettingSaveSchema.safeParse(payload).success).toBe(true);
    });

    it.each([
        '127.0.0.1:7890',
        'http://',
        'socks5://127.0.0.1',
        'socks5://:1080',
        'ftp://127.0.0.1:21',
    ])('proxySettingSaveSchema 拒绝 custom 模式下的非法代理地址：%s', (badUrl) => {
        const parsed = proxySettingSaveSchema.safeParse({
            mode: 'custom',
            url: badUrl,
            bypassRules: '',
        });
        expect(parsed.success).toBe(false);
    });
});
