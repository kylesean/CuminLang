import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
    cleanupOldLlamaVersions,
    ensureLlamaSonameAliases,
    extractZipFile,
    getLlamaExecutablePath,
    getLlamaRuntimeDir,
    installLlamaRuntimeFromArchive,
    isLlamaRuntimeReady,
    isRequiredLlamaRuntimeFile,
} from '@/backend/infrastructure/ai/llamaRuntimeInstaller';
import { LLAMA_RUNTIME_VERSION } from '@/common/contracts/local-ai';

/**
 * 构造仅含 Stored / Deflate 条目的最小真实 ZIP 文件，用于在单元测试中验证解压与防越界逻辑。
 */
function buildTestZip(entries: Array<{ name: string; content: string; deflate?: boolean }>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const rawBuf = Buffer.from(entry.content, 'utf8');
        const method = entry.deflate ? 8 : 0;
        const payload = entry.deflate ? zlib.deflateRawSync(rawBuf) : rawBuf;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(rawBuf.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);

        localParts.push(local, nameBuf, payload);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(rawBuf.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);

        centralParts.push(central, nameBuf);
        offset += local.length + nameBuf.length + payload.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralBuf, eocd]);
}

describe('llamaRuntimeInstaller', () => {
    let tmpDir: string | null = null;

    afterEach(async () => {
        if (tmpDir) {
            await fs.rm(tmpDir, { recursive: true, force: true });
            tmpDir = null;
        }
    });

    it.each([
        ['linux', 'llama-server', true],
        ['linux', 'libllama-server-impl.so', true],
        ['linux', 'libllama.so.0.9.0', true],
        ['linux', 'libllama-common.so.0.9.0', true],
        ['linux', 'libmtmd.so.0.9.0', true],
        ['linux', 'libggml-vulkan.so', true],
        ['linux', 'llama-cli', false],
        ['linux', 'llama-connect', false],
        ['linux', 'libllama-bench-impl.so', false],
        ['linux', 'libggml-rpc.so', false],
        ['darwin', 'llama-server', true],
        ['darwin', 'libllama-server-impl.dylib', true],
        ['darwin', 'libggml-metal.0.dylib', true],
        ['darwin', 'llama-bench', false],
        ['win32', 'llama-server.exe', true],
        ['win32', 'llama-server-impl.dll', true],
        ['win32', 'ggml-vulkan.dll', true],
        ['win32', 'llama-cli.exe', false],
        ['win32', 'ggml-rpc.dll', false],
    ])('按平台精确筛选 %s/%s -> %s', (platform, basename, expected) => {
        expect(isRequiredLlamaRuntimeFile(basename, platform)).toBe(expected);
    });

    it('从 Windows ZIP 归档提取并裁掉无关 CLI，且清理历史旧版本目录', async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-inst-'));
        const modelsDir = path.join(tmpDir, 'models');
        const oldVersionDir = getLlamaRuntimeDir(modelsDir, 'b10819', 'win32', 'x64');
        await fs.mkdir(oldVersionDir, { recursive: true });
        await fs.writeFile(path.join(oldVersionDir, 'stale.txt'), 'old');

        const zipPath = path.join(tmpDir, 'llama-win.zip');
        const zipBuf = buildTestZip([
            { name: 'llama-b12292/llama-server.exe', content: 'server-exe', deflate: true },
            { name: 'llama-b12292/llama-server-impl.dll', content: 'server-dll', deflate: false },
            { name: 'llama-b12292/llama-common.dll', content: 'common-dll', deflate: true },
            { name: 'llama-b12292/mtmd.dll', content: 'mtmd-dll', deflate: true },
            { name: 'llama-b12292/llama.dll', content: 'llama-dll', deflate: true },
            { name: 'llama-b12292/ggml-vulkan.dll', content: 'vulkan-dll', deflate: true },
            { name: 'llama-b12292/llama-cli.exe', content: 'should-be-dropped', deflate: true },
            { name: 'llama-b12292/llama-bench.exe', content: 'should-be-dropped', deflate: false },
        ]);
        await fs.writeFile(zipPath, zipBuf);

        const installedDir = await installLlamaRuntimeFromArchive({
            archivePath: zipPath,
            modelsDir,
            platform: 'win32',
            arch: 'x64',
            version: LLAMA_RUNTIME_VERSION,
        });

        expect(isLlamaRuntimeReady(installedDir, 'win32', LLAMA_RUNTIME_VERSION)).toBe(true);
        expect(await fs.readFile(getLlamaExecutablePath(installedDir, 'win32'), 'utf8')).toBe('server-exe');

        const files = await fs.readdir(installedDir);
        expect(files).toContain('ggml-vulkan.dll');
        expect(files).not.toContain('llama-cli.exe');
        expect(files).not.toContain('llama-bench.exe');
        await expect(fs.stat(oldVersionDir)).rejects.toThrow();
    });

    it('拒绝包含 Zip Slip 路径穿越条目的归档', async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-zipslip-'));
        const zipPath = path.join(tmpDir, 'evil.zip');
        await fs.writeFile(zipPath, buildTestZip([
            { name: '../outside.txt', content: 'evil' },
        ]));

        await expect(extractZipFile(zipPath, path.join(tmpDir, 'dest'))).rejects.toThrow('越界');
    });

    it('Linux 运行时自动补齐缺失的 .so.0 SONAME 符号链接并支持手动清理旧版本', async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-soname-'));
        const runtimeDir = path.join(tmpDir, 'runtime');
        await fs.mkdir(runtimeDir, { recursive: true });
        await fs.writeFile(path.join(runtimeDir, 'libllama.so.0.9.0'), 'so');

        ensureLlamaSonameAliases(runtimeDir, 'linux');
        expect(await fs.readlink(path.join(runtimeDir, 'libllama.so.0'))).toBe('libllama.so.0.9.0');

        const oldDir = getLlamaRuntimeDir(tmpDir, 'b00001');
        await fs.mkdir(oldDir, { recursive: true });
        await cleanupOldLlamaVersions(tmpDir, LLAMA_RUNTIME_VERSION);
        await expect(fs.stat(oldDir)).rejects.toThrow();
    });
});
