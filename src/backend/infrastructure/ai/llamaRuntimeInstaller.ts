import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import * as tarFs from 'tar-fs';

import { LLAMA_RUNTIME_VERSION } from '@/common/contracts/local-ai';

/**
 * llama.cpp 本地推理运行时安装器。
 *
 * 仅负责把官方压缩包校验、过滤（只提取 `llama-server` 与其直接依赖的动态库，
 * 剔除 `llama-cli` / `llama-bench` / `llama-connect` 等无关工具）、补全 Linux SONAME
 * 别名并原子落盘到用户模型目录下的 `runtimes/llama/<version>/<platform>-<arch>/`。
 */

const COMPLETION_MARKER = '.complete';

/** 返回所有版本 llama 运行时的根目录。 */
export const getLlamaRuntimeBaseDir = (modelsDir: string): string =>
    path.join(modelsDir, 'runtimes', 'llama');

/** 返回指定版本与平台/架构的 llama 运行时目录。 */
export const getLlamaRuntimeDir = (
    modelsDir: string,
    version: string = LLAMA_RUNTIME_VERSION,
    platform: string = process.platform,
    arch: string = process.arch,
): string => path.join(getLlamaRuntimeBaseDir(modelsDir), version, `${platform}-${arch}`);

/** 返回运行时目录下 `llama-server` 可执行文件绝对路径。 */
export const getLlamaExecutablePath = (
    runtimeDir: string,
    platform: string = process.platform,
): string => path.join(runtimeDir, platform === 'win32' ? 'llama-server.exe' : 'llama-server');

/** 各平台 `llama-server` 启动必需的动态库前缀清单。 */
export const llamaDependencyPrefixesFor = (platform: string = process.platform): readonly string[] => (
    platform === 'win32'
        ? ['mtmd', 'llama-common', 'llama-server-impl']
        : ['libmtmd', 'libllama-common', 'libllama-server-impl']
);

/** 判断运行时目录是否已完整安装指定版本。 */
export const isLlamaRuntimeReady = (
    runtimeDir: string,
    platform: string = process.platform,
    version: string = LLAMA_RUNTIME_VERSION,
): boolean => {
    try {
        const markerPath = path.join(runtimeDir, COMPLETION_MARKER);
        if (!fs.existsSync(markerPath)) {
            return false;
        }
        const recorded = fs.readFileSync(markerPath, 'utf8').trim();
        if (recorded !== version) {
            return false;
        }
        if (!fs.existsSync(getLlamaExecutablePath(runtimeDir, platform))) {
            return false;
        }
        const entries = fs.readdirSync(runtimeDir);
        return llamaDependencyPrefixesFor(platform).every(
            (prefix) => entries.some((entry) => entry.startsWith(prefix)),
        );
    } catch {
        return false;
    }
};

/**
 * 过滤出 `llama-server` 运行真正需要的文件，剔除无关 CLI 与 bench/quantize 库。
 */
export const isRequiredLlamaRuntimeFile = (basename: string, platform: string = process.platform): boolean => {
    if (!basename) return false;
    if (basename === 'LICENSE') return true;
    if (platform === 'win32') {
        if (basename === 'llama-server.exe') return true;
        if (!basename.toLowerCase().endsWith('.dll')) return false;
        if (basename.startsWith('ggml-rpc')) return false;
        return basename === 'llama-server-impl.dll'
            || basename === 'llama-common.dll'
            || basename === 'llama.dll'
            || basename === 'mtmd.dll'
            || basename.startsWith('ggml');
    }
    if (platform === 'darwin') {
        if (basename === 'llama-server') return true;
        if (basename.endsWith('.metal')) return true;
        if (!basename.endsWith('.dylib')) return false;
        if (basename.startsWith('libggml-rpc')) return false;
        return basename.startsWith('libllama-server-impl')
            || basename.startsWith('libllama-common')
            || basename.startsWith('libllama.')
            || basename.startsWith('libmtmd')
            || basename.startsWith('libggml');
    }
    if (basename === 'llama-server') return true;
    if (!/\.so(\.|$)/.test(basename)) return false;
    if (basename.startsWith('libggml-rpc')) return false;
    return basename.startsWith('libllama-server-impl')
        || basename.startsWith('libllama-common')
        || basename.startsWith('libllama.')
        || basename.startsWith('libmtmd')
        || basename.startsWith('libggml');
};

/**
 * 补建 llama.cpp Linux 运行包缺失的 `.so.0` SONAME 别名。
 *
 * 官方 Linux 包只附带三段版本号文件名（如 `libllama.so.0.9.0`），缺少 `.so.0` 符号链接时
 * 动态链接器会直接报错找不到共享库。
 */
export const ensureLlamaSonameAliases = (
    runtimeDir: string,
    targetPlatform: string = process.platform,
): void => {
    if (targetPlatform === 'win32' || targetPlatform === 'darwin' || !fs.existsSync(runtimeDir)) {
        return;
    }
    for (const entry of fs.readdirSync(runtimeDir)) {
        const match = entry.match(/^(.+)\.so\.\d+\.\d+\.\d+$/);
        if (!match) continue;
        const alias = path.join(runtimeDir, `${match[1]}.so.0`);
        const existing = fs.lstatSync(alias, { throwIfNoEntry: false });
        if (existing) {
            if (!existing.isSymbolicLink() || fs.existsSync(alias)) continue;
            fs.unlinkSync(alias);
        }
        fs.symlinkSync(entry, alias);
    }
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

/**
 * 纯 Node 解压标准 ZIP 归档（支持 Stored=0 与 Deflate=8），并防 Zip Slip 越权写入。
 */
export const extractZipFile = async (
    zipPath: string,
    destDir: string,
    signal?: AbortSignal,
): Promise<void> => {
    if (signal?.aborted) {
        throw new Error('Aborted');
    }
    const buf = await fs.promises.readFile(zipPath);
    // End of Central Directory 最小 22 字节，注释最长 65535 字节
    const minOffset = Math.max(0, buf.length - 22 - 65535);
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= minOffset; i -= 1) {
        if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
            const commentLen = buf.readUInt16LE(i + 20);
            if (i + 22 + commentLen === buf.length) {
                eocdOffset = i;
                break;
            }
        }
    }
    if (eocdOffset < 0) {
        throw new Error('无效的 ZIP 归档：未找到 End of Central Directory');
    }
    const entryCount = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    const resolvedDest = path.resolve(destDir);
    await fs.promises.mkdir(resolvedDest, { recursive: true });

    let cursor = cdOffset;
    for (let idx = 0; idx < entryCount; idx += 1) {
        if (signal?.aborted) {
            throw new Error('Aborted');
        }
        if (buf.readUInt32LE(cursor) !== CENTRAL_FILE_SIGNATURE) {
            throw new Error('无效的 ZIP 中央目录头');
        }
        const compressionMethod = buf.readUInt16LE(cursor + 10);
        const compressedSize = buf.readUInt32LE(cursor + 20);
        const nameLength = buf.readUInt16LE(cursor + 28);
        const extraLength = buf.readUInt16LE(cursor + 30);
        const commentLength = buf.readUInt16LE(cursor + 32);
        const localHeaderOffset = buf.readUInt32LE(cursor + 42);
        const entryName = buf.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
        cursor += 46 + nameLength + extraLength + commentLength;

        if (entryName.endsWith('/')) {
            continue;
        }
        const targetPath = path.resolve(resolvedDest, entryName);
        if (targetPath !== resolvedDest && !targetPath.startsWith(`${resolvedDest}${path.sep}`)) {
            throw new Error(`ZIP 条目路径越界：${entryName}`);
        }
        if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
            throw new Error(`无效的 ZIP 本地文件头：${entryName}`);
        }
        const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

        let content: Buffer;
        if (compressionMethod === 0) {
            content = Buffer.from(compressedData);
        } else if (compressionMethod === 8) {
            content = zlib.inflateRawSync(compressedData);
        } else {
            throw new Error(`不支持的 ZIP 压缩算法 ${compressionMethod}：${entryName}`);
        }
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.writeFile(targetPath, content);
    }
};

/** 解压 `.tar.gz` 或 `.zip` 归档到指定目录。 */
export const extractLlamaArchive = async (
    archivePath: string,
    destDir: string,
    signal?: AbortSignal,
): Promise<void> => {
    if (archivePath.endsWith('.zip')) {
        await extractZipFile(archivePath, destDir, signal);
        return;
    }
    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
        await fs.promises.mkdir(destDir, { recursive: true });
        await pipeline(
            fs.createReadStream(archivePath),
            zlib.createGunzip(),
            tarFs.extract(destDir),
            ...(signal ? [{ signal }] : []),
        );
        return;
    }
    throw new Error(`不支持的 llama 运行时归档格式：${archivePath}`);
};

const collectRequiredEntries = (
    dir: string,
    platform: string,
    depth = 0,
    maxDepth = 6,
): Array<{ fullPath: string; basename: string; isSymlink: boolean }> => {
    if (depth > maxDepth) return [];
    const results: Array<{ fullPath: string; basename: string; isSymlink: boolean }> = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, ent.name);
        if ((ent.isFile() || ent.isSymbolicLink()) && isRequiredLlamaRuntimeFile(ent.name, platform)) {
            results.push({ fullPath, basename: ent.name, isSymlink: ent.isSymbolicLink() });
        } else if (ent.isDirectory()) {
            results.push(...collectRequiredEntries(fullPath, platform, depth + 1, maxDepth));
        }
    }
    return results;
};

/** 清理历史版本的 `runtimes/llama/<oldVersion>` 目录，避免升级后残留多份运行时。 */
export const cleanupOldLlamaVersions = async (
    modelsDir: string,
    keepVersion: string = LLAMA_RUNTIME_VERSION,
): Promise<void> => {
    const baseDir = getLlamaRuntimeBaseDir(modelsDir);
    if (!fs.existsSync(baseDir)) return;
    for (const entry of await fs.promises.readdir(baseDir)) {
        if (entry === keepVersion || entry.startsWith('.tmp-')) continue;
        await fs.promises.rm(path.join(baseDir, entry), { recursive: true, force: true }).catch(() => undefined);
    }
};

/**
 * 从已通过 SHA-256 校验的归档中按需提取并原子安装 `llama-server` 运行时。
 */
export const installLlamaRuntimeFromArchive = async (params: {
    archivePath: string;
    modelsDir: string;
    platform?: string;
    arch?: string;
    version?: string;
    signal?: AbortSignal;
}): Promise<string> => {
    const platform = params.platform ?? process.platform;
    const arch = params.arch ?? process.arch;
    const version = params.version ?? LLAMA_RUNTIME_VERSION;
    const baseDir = getLlamaRuntimeBaseDir(params.modelsDir);
    await fs.promises.mkdir(baseDir, { recursive: true });
    const tmpRoot = await fs.promises.mkdtemp(path.join(baseDir, '.tmp-install-'));
    const extractDir = path.join(tmpRoot, 'extract');
    const stagingDir = path.join(tmpRoot, 'stage');
    const targetDir = getLlamaRuntimeDir(params.modelsDir, version, platform, arch);

    try {
        await extractLlamaArchive(params.archivePath, extractDir, params.signal);
        await fs.promises.mkdir(stagingDir, { recursive: true });

        const collected = collectRequiredEntries(extractDir, platform);
        const keptNames = new Set(collected.map((item) => item.basename));
        // 先落真实文件，再重建指向已保留文件的相对软链
        for (const item of collected) {
            if (item.isSymlink) continue;
            const dest = path.join(stagingDir, item.basename);
            await fs.promises.copyFile(item.fullPath, dest);
            if (platform !== 'win32') {
                await fs.promises.chmod(dest, 0o755);
            }
        }
        for (const item of collected) {
            if (!item.isSymlink) continue;
            const dest = path.join(stagingDir, item.basename);
            if (fs.existsSync(dest)) continue;
            let rawTarget: string;
            try {
                rawTarget = fs.readlinkSync(item.fullPath);
            } catch {
                continue;
            }
            const targetName = path.basename(rawTarget);
            if (keptNames.has(targetName)) {
                fs.symlinkSync(targetName, dest);
            } else {
                const resolvedTarget = path.resolve(path.dirname(item.fullPath), rawTarget);
                if (fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).isFile()) {
                    await fs.promises.copyFile(resolvedTarget, dest);
                    if (platform !== 'win32') {
                        await fs.promises.chmod(dest, 0o755);
                    }
                }
            }
        }

        ensureLlamaSonameAliases(stagingDir, platform);
        await fs.promises.writeFile(path.join(stagingDir, COMPLETION_MARKER), `${version}\n`, 'utf8');

        if (!isLlamaRuntimeReady(stagingDir, platform, version)) {
            throw new Error(`llama.cpp 运行时包不完整，缺少 llama-server 或关键依赖库`);
        }

        await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
        await fs.promises.rm(targetDir, { recursive: true, force: true });
        await fs.promises.rename(stagingDir, targetDir);
        await cleanupOldLlamaVersions(params.modelsDir, version);
        return targetDir;
    } finally {
        await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
};
