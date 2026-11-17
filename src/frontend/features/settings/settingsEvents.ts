import type { RegisterRendererApi } from '@/frontend/infrastructure/electron/rendererApiRegistry';
import type { RendererApiDefinitions } from '@/common/api/renderer-api-def';

/** 离线归档模型下载来源，用于避免并发下载时进度事件互相串台。 */
export type ArchiveProgressSource =
    | 'tts'
    | 'whisper-cpp'
    | 'parakeet'
    | 'diarization'
    | 'phonemeGop'
    | 'senseVoice';

/**
 * 离线模型归档下载解压进度事件负载。
 */
export type ArchiveDownloadProgressEvent =
    RendererApiDefinitions['settings/sherpa-tts-model-download-progress']['params'] & {
        source?: ArchiveProgressSource;
    };

/**
 * 语义向量模型下载进度事件负载。
 */
export type EmbeddingDownloadProgressEvent = RendererApiDefinitions['settings/embedding-model-download-progress']['params'];

type ArchiveProgressListener = (progress: ArchiveDownloadProgressEvent) => void;
type EmbeddingProgressListener = (progress: EmbeddingDownloadProgressEvent) => void;

const archiveListeners = new Set<ArchiveProgressListener>();
const embeddingListeners = new Set<EmbeddingProgressListener>();

/**
 * 订阅离线模型解压与下载进度事件（sherpa-tts / whisper-cpp / parakeet）。
 *
 * @param listener 进度回调函数。
 * @returns 取消订阅函数。
 */
export function subscribeArchiveDownloadProgress(listener: ArchiveProgressListener): () => void {
    archiveListeners.add(listener);
    return () => {
        archiveListeners.delete(listener);
    };
}

/**
 * 订阅语义向量模型下载进度事件。
 *
 * @param listener 进度回调函数。
 * @returns 取消订阅函数。
 */
export function subscribeEmbeddingDownloadProgress(listener: EmbeddingProgressListener): () => void {
    embeddingListeners.add(listener);
    return () => {
        embeddingListeners.delete(listener);
    };
}

/**
 * 注册设置与离线模型资源下载相关的 main 进程回调通道。
 *
 * @param register 接口注册函数。
 */
export function registerSettingsRendererApis(register: RegisterRendererApi): void {
    const notifyArchive = (detail: ArchiveDownloadProgressEvent) => {
        archiveListeners.forEach((listener) => {
            try {
                listener(detail);
            } catch {
                // 忽略单个监听器的异常，避免阻断其余监听器
            }
        });
    };

    register('settings/parakeet-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'parakeet' });
    });

    register('settings/speaker-diarization-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'diarization' });
    });

    register('settings/sherpa-tts-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'tts' });
    });

    register('settings/whisper-cpp-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'whisper-cpp' });
    });

    register('settings/phoneme-gop-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'phonemeGop' });
    });

    register('settings/sense-voice-model-download-progress', async (params) => {
        notifyArchive({ ...params, source: 'senseVoice' });
    });

    register('settings/embedding-model-download-progress', async (params) => {
        embeddingListeners.forEach((listener) => {
            try {
                listener(params);
            } catch {
                // 忽略单个监听器的异常
            }
        });
    });
}
