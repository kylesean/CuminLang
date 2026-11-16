import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import FileSystemGatewayImpl from '@/backend/infrastructure/storage/FileSystemGatewayImpl';

describe('FileSystemGatewayImpl.readTextFile', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            await fs.rm(tempDirs.pop()!, { recursive: true, force: true });
        }
    });

    it('当 jschardet 识别出 iconv-lite 不支持的编码名（如含 ~{ 触发 HZ-GB-2312）时安全回退 utf-8', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-fs-gateway-'));
        tempDirs.push(dir);
        const filePath = path.join(dir, 'sample.srt');
        const content = '1\n00:00:01,000 --> 00:00:03,000\n~{<:Ky2;S{#,NpJ)l6HK!#~}\n';
        await fs.writeFile(filePath, content, 'utf8');

        const gateway = new FileSystemGatewayImpl();
        await expect(gateway.readTextFile(filePath)).resolves.toBe(content);
    });
});
