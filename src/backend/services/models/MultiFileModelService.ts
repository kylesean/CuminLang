import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import { StorageDirectoryTarget } from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type LocalModelService from '@/backend/services/models/LocalModelService';
import { getMainLogger } from '@/backend/infrastructure/logger';
import type { ModelInstallationStatusVO } from '@/common/types/vo/model-installation-vo';
import type { ModelDownloadPhase } from '@/common/contracts/model-download-phase';

export interface MultiFileDownloadItem {
    /** 落盘文件名（位于 modelDirectoryName 下）。 */
    fileName: string;
    /** 有序镜像地址列表：优先尝试靠前镜像。 */
    urls: readonly string[];
    /** 预期的十六进制 SHA-256 校验值；所有下载源落盘后都必须通过完整性校验。 */
    sha256: string;
    /** 是否把该文件字节流作为整体进度主指标（一般指向最大的模型权重文件）。 */
    reportProgress?: boolean;
}

export interface MultiFileModelSpec {
    /** 安装目录名（位于 MODELS 根目录下）。 */
    modelDirectoryName: string;
    /** 需顺序下载并校验的必需文件列表。 */
    files: readonly MultiFileDownloadItem[];
    /** 进度广播的 renderer IPC 事件名。 */
    progressEventName:
        | 'settings/phoneme-gop-model-download-progress'
        | 'settings/sense-voice-model-download-progress';
    /** 用于错误/状态文案的模型名称。 */
    modelDisplayName: string;
    /** status.downloadUrls 展示用的主权重地址列表。 */
    primaryDownloadUrls: readonly string[];
    /** status.archivePath 指向的主文件文件名。 */
    primaryFileName: string;
}

type DownloadLifecycle =
    | { kind: 'idle' }
    | { kind: 'downloading'; task: Promise<{ success: boolean; message: string }>; abort: AbortController; percent: number }
    | { kind: 'cancelling'; task: Promise<{ success: boolean; message: string }> };

/**
 * 多文件直接下载型本地模型基类（无 tar 归档解压步骤）。
 *
 * 与 {@link ModelArchiveService} 平行：支持有序镜像回退、进度事件广播、
 * `.downloading` 临时目录原子切换、取消下载与整目录清理。
 */
export default abstract class MultiFileModelService implements LocalModelService {
    private readonly logger = getMainLogger('MultiFileModelService');
    private lifecycle: DownloadLifecycle = { kind: 'idle' };

    protected constructor(
        private readonly spec: MultiFileModelSpec,
        private readonly rendererGateway: RendererGateway,
        private readonly storageDirectoryProvider: StorageDirectoryProvider,
        private readonly fileSystemGateway: FileSystemGateway,
    ) {}

    public async getStatus(): Promise<ModelInstallationStatusVO> {
        const modelPath = await this.getModelDir();
        const missingFiles: string[] = [];
        for (const item of this.spec.files) {
            const exists = await this.fileSystemGateway.fileExists(path.join(modelPath, item.fileName));
            if (!exists) {
                missingFiles.push(item.fileName);
            }
        }
        const active = this.lifecycle.kind !== 'idle';
        return {
            ready: missingFiles.length === 0,
            modelPath,
            missingFiles,
            downloading: active,
            phase: this.lifecycle.kind === 'downloading' ? 'downloading' : null,
            percent: this.lifecycle.kind === 'downloading' ? this.lifecycle.percent : 0,
            downloadUrls: [...this.spec.primaryDownloadUrls],
            archivePath: path.join(modelPath, this.spec.primaryFileName),
        };
    }

    public async download(): Promise<{ success: boolean; message: string }> {
        if (this.lifecycle.kind === 'cancelling') {
            await this.lifecycle.task.catch(() => undefined);
        }
        if (this.lifecycle.kind === 'downloading') {
            return this.lifecycle.task;
        }
        const abortController = new AbortController();
        const task = (async () => {
            const status = await this.getStatus();
            if (abortController.signal.aborted) {
                return { success: false, message: `${this.spec.modelDisplayName}下载已取消` };
            }
            if (status.ready) {
                return { success: true, message: `${this.spec.modelDisplayName}已就绪` };
            }
            return this.runDownload(abortController);
        })().finally(() => {
            if (this.lifecycle.kind !== 'idle' && this.lifecycle.task === task) {
                this.lifecycle = { kind: 'idle' };
            }
        });
        this.lifecycle = { kind: 'downloading', task, abort: abortController, percent: 0 };
        return task;
    }

    public async cancelDownload(): Promise<{ cancelled: boolean }> {
        if (this.lifecycle.kind === 'downloading') {
            const { task, abort } = this.lifecycle;
            this.lifecycle = { kind: 'cancelling', task };
            abort.abort();
            return { cancelled: true };
        }
        if (this.lifecycle.kind === 'cancelling') {
            return { cancelled: true };
        }
        return { cancelled: false };
    }

    public async deleteModel(): Promise<{ success: boolean; message: string }> {
        const inflight = this.lifecycle.kind === 'idle' ? null : this.lifecycle.task;
        await this.cancelDownload();
        if (inflight) {
            await inflight.catch(() => undefined);
        }
        const modelDir = await this.getModelDir();
        await Promise.all([
            this.fileSystemGateway.removeDirectoryIfExists(modelDir),
            this.fileSystemGateway.removeDirectoryIfExists(`${modelDir}.downloading`),
        ]);
        return { success: true, message: `${this.spec.modelDisplayName}已删除` };
    }

    private async getModelDir(): Promise<string> {
        const modelsRoot = await this.storageDirectoryProvider.provideDirectory(StorageDirectoryTarget.MODELS);
        return path.join(modelsRoot, this.spec.modelDirectoryName);
    }

    private async runDownload(abortController: AbortController): Promise<{ success: boolean; message: string }> {
        const modelDir = await this.getModelDir();
        const workDir = `${modelDir}.downloading`;

        try {
            await this.fileSystemGateway.ensureDirectory(workDir);
            for (const item of this.spec.files) {
                await this.downloadWithFallback(
                    item.urls,
                    path.join(workDir, item.fileName),
                    item.sha256,
                    abortController.signal,
                    Boolean(item.reportProgress),
                );
            }

            await this.fileSystemGateway.ensureDirectory(modelDir);
            for (const item of this.spec.files) {
                const src = path.join(workDir, item.fileName);
                const dest = path.join(modelDir, item.fileName);
                if (await this.fileSystemGateway.fileExists(dest)) {
                    await this.fileSystemGateway.removeFileIfExists(dest);
                }
                await fs.promises.rename(src, dest);
            }
            await this.fileSystemGateway.removeDirectoryIfExists(workDir).catch(() => undefined);
            this.emitProgress(100, 0, 0, 'idle');
            return { success: true, message: `${this.spec.modelDisplayName}安装完成` };
        } catch (error) {
            await this.fileSystemGateway.removeDirectoryIfExists(workDir).catch(() => undefined);
            if (abortController.signal.aborted) {
                this.emitProgress(0, 0, 0, 'idle');
                return { success: false, message: `${this.spec.modelDisplayName}下载已取消` };
            }
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`${this.spec.modelDisplayName}下载失败`, { error: message });
            this.emitProgress(0, 0, 0, 'idle');
            return { success: false, message };
        }
    }

    private async downloadWithFallback(
        urls: readonly string[],
        targetPath: string,
        expectedSha256: string,
        signal: AbortSignal,
        reportProgress: boolean,
    ): Promise<void> {
        let lastError: unknown = null;
        for (const url of urls) {
            try {
                const response = await fetch(url, { signal });
                if (!response.ok || !response.body) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const totalBytes = Number(response.headers.get('content-length') ?? '0');
                let receivedBytes = 0;
                const bodyStream = Readable.fromWeb(
                    response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
                );
                bodyStream.on('data', (chunk: Buffer) => {
                    receivedBytes += chunk.byteLength;
                    if (reportProgress) {
                        const percent = totalBytes > 0
                            ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100))
                            : 0;
                        this.emitProgress(percent, receivedBytes, totalBytes, 'downloading');
                    }
                });
                const writer = fs.createWriteStream(targetPath);
                await pipeline(bodyStream, writer, { signal });
                await this.verifyFileSha256(targetPath, expectedSha256, signal);
                return;
            } catch (error) {
                await this.fileSystemGateway.removeFileIfExists(targetPath).catch(() => undefined);
                lastError = error;
                if (signal.aborted) {
                    throw error;
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error('下载失败');
    }

    private async verifyFileSha256(filePath: string, expectedSha256: string, signal: AbortSignal): Promise<void> {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath, { signal });
        for await (const chunk of stream) {
            hash.update(chunk as Buffer);
        }
        const actual = hash.digest('hex');
        if (actual !== expectedSha256.toLowerCase()) {
            throw new Error(
                `${this.spec.modelDisplayName}文件完整性校验失败 (${path.basename(filePath)} SHA256 不一致)`,
            );
        }
    }

    private emitProgress(
        percent: number,
        downloaded: number,
        total: number,
        phase: ModelDownloadPhase,
    ): void {
        if (this.lifecycle.kind === 'downloading') {
            this.lifecycle.percent = percent;
        }
        this.rendererGateway.fireAndForget(this.spec.progressEventName, {
            percent,
            downloaded,
            total,
            phase,
        });
    }
}
