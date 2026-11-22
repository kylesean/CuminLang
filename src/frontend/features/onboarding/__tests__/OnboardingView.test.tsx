import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingView, CURRENT_ONBOARDING_VERSION } from '../OnboardingView';
import { getSystemInfo, markOnboardingCompleted } from '../onboardingApi';
import { settingsApi } from '@/frontend/features/settings/settingsApi';
import { englishDictionaryApi } from '@/frontend/features/settings/englishDictionaryApi';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import type { LocalEmbeddingStatus } from '@/common/contracts/local-ai';

vi.mock('@/frontend/features/onboarding/onboardingApi', () => ({
    markOnboardingCompleted: vi.fn(),
    getSystemInfo: vi.fn(),
}));

vi.mock('@/frontend/features/settings/englishDictionaryApi', () => ({
    englishDictionaryApi: {
        status: vi.fn(),
        install: vi.fn(),
        cancel: vi.fn(),
    },
}));

vi.mock('@/frontend/app/stores/dpTaskStore', () => ({
    default: {
        getState: vi.fn(),
    },
}));

vi.mock('@/frontend/features/settings/settingsEvents', () => ({
    subscribeArchiveDownloadProgress: vi.fn(() => () => {}),
    subscribeEmbeddingDownloadProgress: vi.fn(() => () => {}),
}));

vi.mock('@/frontend/features/settings/settingsApi', () => ({
    settingsApi: {
        getStorageStatus: vi.fn(),
        selectStorageFolder: vi.fn(),
        saveStorage: vi.fn(),
        openUrl: vi.fn(),
        openFolderForFile: vi.fn(),
        getSherpaTtsModelStatus: vi.fn(),
        getWhisperCppModelStatus: vi.fn(),
        getParakeetModelStatus: vi.fn(),
        downloadSherpaTtsModel: vi.fn(),
        downloadWhisperCppModel: vi.fn(),
        downloadParakeetModel: vi.fn(),
        cancelSherpaTtsModelDownload: vi.fn(),
        cancelWhisperCppModelDownload: vi.fn(),
        cancelParakeetModelDownload: vi.fn(),
        getEmbeddingModelStatus: vi.fn(),
        downloadEmbeddingModel: vi.fn(),
        cancelEmbeddingModelDownload: vi.fn(),
        getServiceCredentials: vi.fn(),
        saveServiceCredentials: vi.fn(),
        getEngineSelection: vi.fn(),
        saveEngineSelection: vi.fn(),
        saveTranscriptionEngine: vi.fn(),
    },
}));

vi.mock('@/frontend/components/layout/TitleBar/TitleBar', () => ({
    default: () => <div data-testid="title-bar" />,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

const NOT_READY = {
    ready: false,
    downloading: false,
    phase: null,
    percent: 0,
    downloadUrls: ['https://example.com/model.tar.bz2'],
    archivePath: '/path/model.tar.bz2',
    modelPath: '/path/model',
    missingFiles: [],
};

const READY = { ...NOT_READY, ready: true };

const makeEmbeddingStatus = (ready = false): LocalEmbeddingStatus => ({
    ready,
    name: 'EmbeddingGemma 2 Q4_K_XL',
    sizeLabel: '168 MB',
    bytes: 175_673_856,
    multimodalReady: false,
    multimodalBytes: 554_821_120,
    downloadUrls: ['https://example.com/embed.gguf'],
    modelPath: '/models/embed.gguf',
});

describe('OnboardingView Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(markOnboardingCompleted).mockResolvedValue();
        vi.mocked(getSystemInfo).mockResolvedValue({
            totalMemoryGb: 16,
            cpuCount: 8,
            gpuAcceleration: 'metal',
            platform: 'darwin',
            arch: 'arm64',
            whisperCppSupported: true,
        });
        vi.mocked(settingsApi.saveTranscriptionEngine).mockResolvedValue();
        vi.mocked(settingsApi.saveEngineSelection).mockResolvedValue();
        vi.mocked(settingsApi.downloadSherpaTtsModel).mockResolvedValue({ success: true, message: '' });
        vi.mocked(settingsApi.downloadWhisperCppModel).mockResolvedValue({ success: true, message: '' });
        vi.mocked(settingsApi.downloadParakeetModel).mockResolvedValue({ success: true, message: '' });
        vi.mocked(settingsApi.downloadEmbeddingModel).mockResolvedValue(undefined);
        vi.mocked(settingsApi.cancelSherpaTtsModelDownload).mockResolvedValue({ cancelled: true });
        vi.mocked(settingsApi.getStorageStatus).mockResolvedValue({
            configuredPath: '',
            resolvedPath: '/Users/test/CuminLang',
            exists: true,
            isDirectory: true,
            readable: true,
            writable: true,
            available: true,
            code: 'ok',
            message: '',
        });
        vi.mocked(settingsApi.getSherpaTtsModelStatus).mockResolvedValue(NOT_READY);
        vi.mocked(settingsApi.getWhisperCppModelStatus).mockResolvedValue(NOT_READY);
        vi.mocked(settingsApi.getParakeetModelStatus).mockResolvedValue(NOT_READY);
        vi.mocked(settingsApi.getEmbeddingModelStatus).mockResolvedValue(makeEmbeddingStatus(false));
        vi.mocked(settingsApi.getServiceCredentials).mockResolvedValue({
            openai: {
                embeddingModel: '',
                activeProviderId: 'openai',
                providers: [
                    {
                        id: 'openai',
                        name: 'OpenAI',
                        apiFormat: 'openai',
                        endpoint: 'https://api.openai.com/v1',
                        hasKey: false,
                        keyHint: '',
                        models: [],
                        disabledModels: [],
                    },
                ],
            },
        });
        vi.mocked(settingsApi.getEngineSelection).mockResolvedValue({
            openai: {
                enableSentenceLearning: false,
                featureModels: {
                    sentenceLearning: 'gpt-4o-mini',
                    subtitleTranslation: 'gpt-4o-mini',
                    dictionary: 'gpt-4o-mini',
                },
            },
            providers: {
                subtitleTranslationEngine: 'openai',
                dictionaryEngine: 'openai',
                embeddingEngine: 'auto',
            },
            invalidValues: {},
        });
        vi.mocked(englishDictionaryApi.status).mockResolvedValue({
            installed: false,
            downloading: false,
            downloadedBytes: 0,
            totalBytes: 0,
            error: null,
        });
        vi.mocked(englishDictionaryApi.install).mockResolvedValue(1);
        vi.mocked(useDpTaskCenter.getState).mockReturnValue({
            register: vi.fn(async (fn, callbacks) => {
                const id = await fn();
                callbacks?.onFinish?.({ id, status: 2 } as never);
                return id;
            }),
        } as never);
    });

    it('第一页展示本机硬件摘要与保存位置，继续后进入下载页并加载各项资源状态', async () => {
        render(<OnboardingView />);

        expect(screen.getByText('steps.storage.heroTitle')).toBeDefined();
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        expect(screen.getByText('steps.download.heroTitle')).toBeDefined();
        expect(screen.getByText('steps.download.action')).toBeDefined();

        await waitFor(() => {
            expect(settingsApi.getSherpaTtsModelStatus).toHaveBeenCalled();
            expect(settingsApi.getWhisperCppModelStatus).toHaveBeenCalled();
            expect(settingsApi.getEmbeddingModelStatus).toHaveBeenCalled();
            expect(englishDictionaryApi.status).toHaveBeenCalled();
        });
    });

    it('标准配置设备点击下载后依次安装核心与语义资源（不强行下载本地大模型）', async () => {
        let whisperReady = false;
        vi.mocked(settingsApi.getWhisperCppModelStatus).mockImplementation(async () => (whisperReady ? READY : NOT_READY));
        vi.mocked(settingsApi.downloadWhisperCppModel).mockImplementation(async () => {
            whisperReady = true;
            return { success: true, message: '' };
        });

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        expect(screen.queryByTestId('author-support-banner')).toBeNull();

        fireEvent.click(screen.getByText('steps.download.action'));

        await waitFor(() => {
            expect(englishDictionaryApi.install).toHaveBeenCalled();
            expect(settingsApi.downloadSherpaTtsModel).toHaveBeenCalled();
            expect(settingsApi.downloadWhisperCppModel).toHaveBeenCalled();
            expect(settingsApi.downloadEmbeddingModel).toHaveBeenCalled();
            expect(settingsApi.saveTranscriptionEngine).toHaveBeenCalledWith('whisper-cpp');
            expect(settingsApi.saveEngineSelection).toHaveBeenCalledWith(
                expect.objectContaining({
                    providers: expect.objectContaining({
                        subtitleTranslationEngine: 'none',
                        dictionaryEngine: 'none',
                        embeddingEngine: 'auto',
                    }),
                }),
            );
            expect(markOnboardingCompleted).toHaveBeenCalledWith(CURRENT_ONBOARDING_VERSION);
        });
        expect(await screen.findByText('steps.done.title')).toBeDefined();
    });

    it('任一项下载失败即停下，并把失败原因显示在下载按钮下方', async () => {
        vi.mocked(settingsApi.downloadWhisperCppModel).mockRejectedValue(new Error('网络中断'));

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();
        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(screen.getByText('steps.download.action'));

        await waitFor(() => {
            expect(screen.getByText('网络中断')).toBeDefined();
        });
        expect(markOnboardingCompleted).not.toHaveBeenCalled();
    });

    it('低内存无 GPU 设备默认选中轻量基础包与兼容识别模式，不强拉本地大模型', async () => {
        let parakeetReady = false;
        vi.mocked(getSystemInfo).mockResolvedValue({
            totalMemoryGb: 4,
            cpuCount: 4,
            gpuAcceleration: 'none',
            platform: 'win32',
            arch: 'x64',
            whisperCppSupported: true,
        });
        vi.mocked(settingsApi.getParakeetModelStatus).mockImplementation(async () => (parakeetReady ? READY : NOT_READY));
        vi.mocked(settingsApi.downloadParakeetModel).mockImplementation(async () => {
            parakeetReady = true;
            return { success: true, message: '' };
        });

        render(<OnboardingView />);
        expect(await screen.findByText('hardware.recommendedLight')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(screen.getByText('steps.download.action'));

        await waitFor(() => {
            expect(settingsApi.downloadSherpaTtsModel).toHaveBeenCalled();
            expect(settingsApi.downloadParakeetModel).toHaveBeenCalled();
            expect(settingsApi.downloadWhisperCppModel).not.toHaveBeenCalled();
            expect(settingsApi.saveTranscriptionEngine).toHaveBeenCalledWith('sherpa-onnx');
            expect(markOnboardingCompleted).toHaveBeenCalledWith(CURRENT_ONBOARDING_VERSION);
        });
    });

    it('未配置云端或本地 AI 时跳过下载会清理悬浮的 openai 路由且不切换识别引擎', async () => {
        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(screen.getByText('steps.download.skip'));

        await waitFor(() => {
            expect(settingsApi.downloadSherpaTtsModel).not.toHaveBeenCalled();
            expect(settingsApi.saveEngineSelection).toHaveBeenCalledWith(
                expect.objectContaining({
                    openai: expect.objectContaining({
                        enableSentenceLearning: false,
                    }),
                    providers: expect.objectContaining({
                        subtitleTranslationEngine: 'none',
                        dictionaryEngine: 'none',
                        embeddingEngine: 'auto',
                    }),
                }),
            );
            expect(settingsApi.saveTranscriptionEngine).not.toHaveBeenCalled();
            expect(markOnboardingCompleted).toHaveBeenCalledWith(CURRENT_ONBOARDING_VERSION);
        });
    });

    it('下载中点手动下载会先中断下载，再进入手动下载页', async () => {
        vi.mocked(englishDictionaryApi.status).mockResolvedValue({
            installed: true,
            downloading: false,
            downloadedBytes: 1000,
            totalBytes: 1000,
            error: null,
        });
        vi.mocked(settingsApi.downloadSherpaTtsModel).mockImplementation(() => new Promise(() => {}));

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(screen.getByText('steps.download.action'));

        await waitFor(() => {
            expect(settingsApi.downloadSherpaTtsModel).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByText('steps.models.manualGuideTitle'));

        await waitFor(() => {
            expect(settingsApi.cancelSherpaTtsModelDownload).toHaveBeenCalled();
            expect(screen.getByText('steps.manual.title')).toBeDefined();
        });
    });

    it('所选资源都已就绪时显示完成按钮，点击后启用引擎并在开始使用关闭引导', async () => {
        vi.mocked(englishDictionaryApi.status).mockResolvedValue({
            installed: true,
            downloading: false,
            downloadedBytes: 1000,
            totalBytes: 1000,
            error: null,
        });
        vi.mocked(settingsApi.getSherpaTtsModelStatus).mockResolvedValue(READY);
        vi.mocked(settingsApi.getWhisperCppModelStatus).mockResolvedValue(READY);
        vi.mocked(settingsApi.getEmbeddingModelStatus).mockResolvedValue(makeEmbeddingStatus(true));

        const onCompleted = vi.fn();
        render(<OnboardingView onCompleted={onCompleted} />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(await screen.findByText('steps.download.finish'));

        expect(await screen.findByText('startUsing')).toBeDefined();
        expect(settingsApi.saveTranscriptionEngine).toHaveBeenCalledWith('whisper-cpp');
        fireEvent.click(screen.getByText('startUsing'));
        expect(onCompleted).toHaveBeenCalled();
    });

    it('支持在引导页手动输入模型 ID 并保存四家预设之一的 API 配置，且展示作者联系卡片', async () => {
        vi.mocked(settingsApi.saveServiceCredentials).mockResolvedValue(undefined);
        vi.mocked(settingsApi.getServiceCredentials)
            .mockResolvedValueOnce({
                openai: {
                    embeddingModel: '',
                    activeProviderId: 'deepseek',
                    providers: [
                        {
                            id: 'deepseek',
                            name: 'DeepSeek',
                            apiFormat: 'openai',
                            endpoint: 'https://api.deepseek.com/v1',
                            hasKey: false,
                            keyHint: '',
                            models: [],
                            disabledModels: [],
                        },
                    ],
                },
            })
            .mockResolvedValue({
                openai: {
                    embeddingModel: '',
                    activeProviderId: 'deepseek',
                    providers: [
                        {
                            id: 'deepseek',
                            name: 'DeepSeek',
                            apiFormat: 'openai',
                            endpoint: 'https://api.deepseek.com/v1',
                            hasKey: true,
                            keyHint: '...9999',
                            models: ['deepseek-chat'],
                            disabledModels: [],
                        },
                    ],
                },
            });

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        expect(screen.queryByTestId('author-support-banner')).toBeNull();
        fireEvent.click(screen.getByText('steps.download.cloud.toggle'));
        fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
        fireEvent.change(screen.getByLabelText('steps.download.cloud.apiKeyLabel'), {
            target: { value: 'sk-test-9999' },
        });
        fireEvent.change(screen.getByLabelText('steps.download.cloud.modelLabel'), {
            target: { value: 'deepseek-chat' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'steps.download.cloud.saveButton' }));

        await waitFor(() => {
            expect(settingsApi.saveServiceCredentials).toHaveBeenCalledWith(
                expect.objectContaining({
                    openai: expect.objectContaining({
                        activeProviderId: 'deepseek',
                        providers: [
                            expect.objectContaining({
                                id: 'deepseek',
                                key: 'sk-test-9999',
                                endpoint: 'https://api.deepseek.com/v1',
                                apiFormat: 'openai',
                                models: ['deepseek-chat'],
                            }),
                        ],
                    }),
                }),
            );
        });

        fireEvent.click(screen.getByText('steps.download.skip'));
        await waitFor(() => {
            expect(settingsApi.saveEngineSelection).toHaveBeenCalledWith(
                expect.objectContaining({
                    openai: expect.objectContaining({
                        enableSentenceLearning: true,
                    }),
                    providers: expect.objectContaining({
                        subtitleTranslationEngine: 'openai',
                        dictionaryEngine: 'openai',
                    }),
                }),
            );
        });
    });

    it('已存在旧模型时保存新输入的云端模型，新模型排在 models 首位', async () => {
        vi.mocked(settingsApi.saveServiceCredentials).mockResolvedValue(undefined);
        vi.mocked(settingsApi.getServiceCredentials)
            .mockResolvedValueOnce({
                openai: {
                    embeddingModel: '',
                    activeProviderId: 'deepseek',
                    providers: [
                        {
                            id: 'deepseek',
                            name: 'DeepSeek',
                            apiFormat: 'openai',
                            endpoint: 'https://api.deepseek.com/v1',
                            hasKey: true,
                            keyHint: '...1111',
                            models: ['old-model'],
                            disabledModels: [],
                        },
                    ],
                },
            })
            .mockResolvedValue({
                openai: {
                    embeddingModel: '',
                    activeProviderId: 'deepseek',
                    providers: [
                        {
                            id: 'deepseek',
                            name: 'DeepSeek',
                            apiFormat: 'openai',
                            endpoint: 'https://api.deepseek.com/v1',
                            hasKey: true,
                            keyHint: '...9999',
                            models: ['new-model', 'old-model'],
                            disabledModels: [],
                        },
                    ],
                },
            });

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        fireEvent.click(screen.getByText('steps.download.cloud.toggle'));
        fireEvent.change(screen.getByLabelText('steps.download.cloud.apiKeyLabel'), {
            target: { value: 'sk-new-9999' },
        });
        fireEvent.change(screen.getByLabelText('steps.download.cloud.modelLabel'), {
            target: { value: 'new-model' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'steps.download.cloud.saveButton' }));

        await waitFor(() => {
            expect(settingsApi.saveServiceCredentials).toHaveBeenCalledWith(
                expect.objectContaining({
                    openai: expect.objectContaining({
                        activeProviderId: 'deepseek',
                        providers: [
                            expect.objectContaining({
                                id: 'deepseek',
                                models: ['new-model', 'old-model'],
                            }),
                        ],
                    }),
                }),
            );
        });
    });

    it('低内存设备默认展开云端配置后，用户手动点击开关可以收起并保持收起', async () => {
        vi.mocked(getSystemInfo).mockResolvedValueOnce({
            totalMemoryGb: 4,
            cpuCount: 2,
            gpuAcceleration: 'none',
            platform: 'win32',
            arch: 'x64',
            whisperCppSupported: false,
        });

        render(<OnboardingView />);
        expect(await screen.findByTestId('onboarding-hardware-summary')).toBeDefined();

        fireEvent.click(screen.getByText('nextStep'));
        const toggleBtn = await screen.findByRole('button', { name: 'steps.download.cloud.toggle' });
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(toggleBtn);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    });
});
