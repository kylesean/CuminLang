import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DESKTOP_CONTENT_SECURITY_POLICY } from '@/common/constants/content-security-policy';

describe('桌面渲染进程的 CSP', () => {
    it('index.html 首屏内联脚本的 sha256 必须在 CSP script-src 白名单内', () => {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        const html = readFileSync(htmlPath, 'utf8');
        const match = /<script>([\s\S]*?)<\/script>/.exec(html);
        expect(match, 'index.html 应存在首屏内联主题脚本').not.toBeNull();
        const hash = createHash('sha256').update(match![1]).digest('base64');
        expect(DESKTOP_CONTENT_SECURITY_POLICY).toContain(`'sha256-${hash}'`);
    });
});
