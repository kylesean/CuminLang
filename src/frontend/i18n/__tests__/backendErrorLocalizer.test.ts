import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n, { applyLanguageSetting } from '@/frontend/i18n';
import { CLOUD_AI_NOT_CONFIGURED_MESSAGE } from '@/common/constants/cloud-ai-errors';
import {
    localizeBackendError,
    localizeBackendMessage,
    localizeBackendResult,
} from '@/frontend/i18n/backendErrorLocalizer';
import { formatDpTaskProgress } from '@/frontend/i18n/dpTaskProgress';
import { backendClient } from '@/frontend/infrastructure/electron/backendClient';
import { initIpcMessageToasts } from '@/frontend/app/bootstrap/initIpcMessageToasts';
import * as notification from '@/frontend/components/shared/toasts/notification';

describe('backendErrorLocalizer', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        await applyLanguageSetting('en-US');
    });

    it.each([
        [
            '词典 AI 模型未配置，请先在设置中完成模型配置',
            'Dictionary AI model is not configured. Please configure it in Settings first.',
        ],
        [
            '整句讲解还没选好云端模型，请先在「可用模型」里选一个',
            'No cloud model selected for Sentence Explanation. Please pick one in Available Models first.',
        ],
        [
            '观看记录不存在：42',
            'Watch history record not found: 42',
        ],
        [
            '磁盘空间不足：需要约 512 MB，可用 128 MB',
            'Insufficient disk space: about 512 MB required, 128 MB available',
        ],
        [
            '音素 GOP 模型已删除',
            'Phoneme GOP model deleted',
        ],
        [
            'whisper.cpp 模型下载完成',
            'whisper.cpp installed',
        ],
        [
            '英英释义包安装完成',
            'English-English dictionary pack installed',
        ],
        [
            'Parakeet 模型下载已取消',
            'Parakeet download cancelled',
        ],
        [
            '语义模型下载已取消',
            'Local semantic model download cancelled',
        ],
        [
            'whisper.cpp 模型下载已取消',
            'whisper.cpp download cancelled',
        ],
        [
            '说话人分离模型下载已取消',
            'Speaker diarization model download cancelled',
        ],
        [
            '模型下载请求失败（HTTP 500）',
            'Model download request failed (HTTP 500)',
        ],
        [
            '模型下载请求失败（HTTP 502 Bad Gateway）',
            'Model download request failed (HTTP 502 Bad Gateway)',
        ],
        [
            'whisper.cpp 模型归档校验失败（SHA256 不一致），已删除损坏文件，请重新下载。',
            'whisper.cpp archive checksum verification failed (SHA-256 mismatch). The corrupted file was deleted; please download again.',
        ],
        [
            CLOUD_AI_NOT_CONFIGURED_MESSAGE,
            'AI model is not configured. Go to Settings → Services & Resources to fill in Endpoint, API key (optional for local servers), and model, or click Use Preset.',
        ],
        [
            '手机访问服务已经在运行',
            'Mobile access service is already running',
        ],
        [
            '语义模型正在下载，请等待完成后再试',
            'Local semantic model is currently downloading. Please wait until it finishes.',
        ],
        [
            '语义模型下载失败：HTTP 503',
            'Local semantic model download failed (HTTP 503)',
        ],
        [
            'whisper.cpp 模型文件缺失：/models/ggml.bin，请先在设置中心下载模型',
            'whisper.cpp model file missing: /models/ggml.bin. Please download the model in Settings first.',
        ],
        [
            '输入文件不存在：/tmp/a.mp4',
            'Input file not found: /tmp/a.mp4',
        ],
        [
            '输出目录不存在：/tmp/out',
            'Output directory not found: /tmp/out',
        ],
        [
            'constructor',
            'constructor',
        ],
        [
            '__proto__',
            '__proto__',
        ],
        [
            'valueOf',
            'valueOf',
        ],
        [
            '测试失败: API Key 或 API URL 未配置',
            'Test failed: API key or API URL is not configured',
        ],
        [
            'IPC 请求参数校验失败 (system/open-url): url: 仅支持 HTTPS 外部链接或本机/局域网 HTTP 地址',
            'IPC request validation failed (system/open-url): url: Only HTTPS external links or local/LAN HTTP addresses are supported',
        ],
        [
            '导入完成：共 10 条，保留 2 条，新增 5 条，删除 3 条，已同步单词管理片段',
            'Import complete: 10 total, 2 kept, 5 added, 3 removed; word clips synced',
        ],
        [
            'EACCES: permission denied /tmp/demo',
            'EACCES: permission denied /tmp/demo',
        ],
    ] as const)('在 en-US 下正确翻译并保留细节：%s', async (raw, expected) => {
        await applyLanguageSetting('en-US');
        expect(localizeBackendMessage(raw)).toBe(expected);
    });

    it.each([
        [
            '词典 AI 模型未配置，请先在设置中完成模型配置',
            '词典 AI 模型未配置，请先在设置中完成模型配置',
        ],
        [
            '测试失败: API Key 或 API URL 未配置',
            '测试失败: API Key 或 API URL 未配置',
        ],
    ] as const)('在 zh-CN 下输出简体中文文案：%s', async (raw, expected) => {
        await applyLanguageSetting('zh-CN');
        expect(localizeBackendMessage(raw)).toBe(expected);
    });

    it('localizeBackendError 在英文模式下翻译消息并保留自定义错误名与 cause', async () => {
        await applyLanguageSetting('en-US');
        const original = new Error('yt-dlp 组件下载已取消', { cause: 'sigint' });
        original.name = 'CancelByUserError';

        const localized = localizeBackendError(original) as Error;
        expect(localized).toBeInstanceOf(Error);
        expect(localized.name).toBe('CancelByUserError');
        expect(localized.cause).toBe('sigint');
        expect(localized.message).toBe('yt-dlp binary download cancelled');
    });

    it('localizeBackendResult 翻译状态信封并保持非状态对象不变', async () => {
        await applyLanguageSetting('en-US');
        expect(localizeBackendResult({ success: true, message: '测试成功' })).toEqual({
            success: true,
            message: 'Connection test succeeded',
        });
        const plain = { text: '测试成功' };
        expect(localizeBackendResult(plain)).toBe(plain);
    });

    it('backendClient 与 initIpcMessageToasts 在英文界面下翻译错误与标题', async () => {
        await applyLanguageSetting('en-US');
        const callSpy = vi.spyOn(window.electron, 'call');
        callSpy.mockRejectedValueOnce(
            new Error("Error invoking remote method 'ai-trans/dictionary': Error: 未启用词典服务"),
        );

        await expect(backendClient.call('system/app-version')).rejects.toMatchObject({
            message: 'Dictionary service is not enabled',
        });

        let errorHandler: ((error: Error) => void) | undefined;
        let infoHandler: ((info: string) => void) | undefined;
        vi.spyOn(window.electron, 'onErrorMsg').mockImplementation((fn) => {
            errorHandler = fn;
            return () => undefined;
        });
        vi.spyOn(window.electron, 'onInfoMsg').mockImplementation((fn) => {
            infoHandler = fn;
            return () => undefined;
        });
        const notifySpy = vi.spyOn(notification, 'showNotification').mockImplementation(() => '');

        const stop = initIpcMessageToasts();
        errorHandler?.(new Error('录音时间过短，请多说几个词再结束录音'));
        infoHandler?.('音素 GOP 模型已就绪');
        stop();

        expect(notifySpy).toHaveBeenNthCalledWith(1, {
            title: i18n.t('errors:title'),
            message: 'Recording is too short. Please speak a few words before stopping.',
            variant: 'error',
            dedupeKey: 'ipc-error:Recording is too short. Please speak a few words before stopping.',
        });
        expect(notifySpy).toHaveBeenNthCalledWith(2, {
            title: i18n.t('toast:infoTitle'),
            message: 'Phoneme GOP model is ready',
            variant: 'info',
            dedupeKey: 'ipc-info:Phoneme GOP model is ready',
        });
    });

    it('formatDpTaskProgress 根据界面语言格式化结构化 progressMeta', async () => {
        await applyLanguageSetting('en-US');
        expect(formatDpTaskProgress({
            progress: '识别中 2/4（50%）',
            progressMeta: { code: 'transcribingChunk', percent: 50, params: { current: 2, total: 4 } },
        })).toBe('Recognizing speech 2/4 (50%)');
        expect(formatDpTaskProgress({
            progress: '下载中 42%',
            progressMeta: { code: 'wordnetDownloading', percent: 42 },
        })).toBe('Downloading WordNet 3.1 (42%)…');
        expect(formatDpTaskProgress({
            progress: '解压 WordNet 数据…',
            progressMeta: { code: 'wordnetExtracting' },
        })).toBe('Extracting WordNet data…');

        await applyLanguageSetting('zh-CN');
        expect(formatDpTaskProgress({
            progress: '识别中 2/4（50%）',
            progressMeta: { code: 'transcribingChunk', percent: 50, params: { current: 2, total: 4 } },
        })).toBe('识别中 2/4（50%）');
        expect(formatDpTaskProgress({
            progress: '下载中 42%',
            progressMeta: { code: 'wordnetDownloading', percent: 42 },
        })).toBe('下载 WordNet 3.1（42%）…');
    });
});
