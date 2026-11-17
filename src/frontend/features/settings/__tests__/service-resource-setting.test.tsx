import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import '@/frontend/i18n';

import ServiceResourceSetting from '@/frontend/features/settings/ServiceResourceSetting';

const originalElectron = typeof window !== 'undefined' ? window.electron : undefined;

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (typeof window !== 'undefined') {
        if (originalElectron === undefined) {
            delete (window as { electron?: unknown }).electron;
        } else {
            window.electron = originalElectron;
        }
    }
});

const baseCredentialsDetail = {
    openai: {
        hasKey: false,
        keyHint: '',
        endpoint: 'https://api.deepseek.com/v1',
        apiFormat: 'openai' as const,
        models: ['deepseek-chat'],
        disabledModels: [],
        embeddingModel: '',
        activeProviderId: 'deepseek',
        providers: [
            {
                id: 'deepseek',
                name: 'DeepSeek',
                apiFormat: 'openai' as const,
                endpoint: 'https://api.deepseek.com/v1',
                hasKey: false,
                keyHint: '',
                models: ['deepseek-chat'],
                disabledModels: [],
            },
        ],
    },
    tencent: {
        hasCredentials: false,
        secretIdHint: '',
    },
};

const baseEngineSelection = {
    openai: {
        enableSentenceLearning: false,
        subtitleTranslationMode: 'zh' as const,
        subtitleCustomStyle: '',
        featureModels: {
            sentenceLearning: '',
            subtitleTranslation: '',
            dictionary: '',
        },
    },
    providers: {
        subtitleTranslationEngine: 'none' as const,
        dictionaryEngine: 'none' as const,
        embeddingEngine: 'auto' as const,
    },
    invalidValues: {},
};

const baseResourceStatus = {
    transcriptionEngine: 'whisper-cpp' as const,
    tts: { ready: true, installing: false, files: [] },
    transcription: { ready: true, installing: false, files: [] },
    diarization: { ready: false, installing: false, files: [] },
    hardware: {
        totalMemoryGb: 16,
        cpuCount: 8,
        gpuAcceleration: 'none' as const,
    },
};

const renderCloudTab = () => {
    return render(
        <MemoryRouter initialEntries={['/settings/resources?tab=cloud']}>
            <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
                <ServiceResourceSetting />
            </SWRConfig>
        </MemoryRouter>,
    );
};

describe('ServiceResourceSetting 云端服务交互', () => {
    it('后台自动保存在途时不禁用模型添加、开关与测试等操作控件', async () => {
        let releaseSave!: () => void;
        let saveStarted = false;

        window.electron = {
            call: vi.fn((path: string) => {
                if (path === 'settings/service-credentials/detail') return Promise.resolve(baseCredentialsDetail);
                if (path === 'settings/engine-selection/detail') return Promise.resolve(baseEngineSelection);
                if (path === 'settings/resource-status/detail') return Promise.resolve(baseResourceStatus);
                if (path === 'settings/embedding-model/status') return Promise.resolve({ ready: false, multimodalReady: false });
                if (path === 'settings/service-credentials/save') {
                    saveStarted = true;
                    return new Promise<void>((resolve) => {
                        releaseSave = resolve;
                    });
                }
                return Promise.resolve(undefined);
            }),
            on: vi.fn(() => () => undefined),
        } as never;

        renderCloudTab();

        const endpointInput = await screen.findByDisplayValue('https://api.deepseek.com/v1', {}, { timeout: 3000 });
        fireEvent.change(endpointInput, { target: { value: 'https://api.deepseek.com/v2' } });

        // 等待防抖触发并进入在途保存状态
        await waitFor(() => expect(saveStarted).toBe(true), { timeout: 3000 });

        const row = screen.getByTestId('model-row-deepseek-chat');
        const addButton = screen.getByRole('button', { name: 'Add' });
        const testButton = within(row).getByRole('button', { name: 'Test' });
        const enableSwitch = within(row).getByRole('switch');

        expect(addButton).not.toBeDisabled();
        expect(testButton).not.toBeDisabled();
        expect(enableSwitch).not.toBeDisabled();

        releaseSave();
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('未点保存直接点测试时，先将草稿 Key 落盘再发起连通性测试', async () => {
        const callOrder: string[] = [];
        let savedKey: string | undefined;

        window.electron = {
            call: vi.fn((path: string, params: unknown) => {
                if (path === 'settings/service-credentials/detail') return Promise.resolve(baseCredentialsDetail);
                if (path === 'settings/engine-selection/detail') return Promise.resolve(baseEngineSelection);
                if (path === 'settings/resource-status/detail') return Promise.resolve(baseResourceStatus);
                if (path === 'settings/embedding-model/status') return Promise.resolve({ ready: false, multimodalReady: false });
                if (path === 'settings/service-credentials/save') {
                    const payload = params as { openai: { key?: string } };
                    savedKey = payload.openai.key;
                    callOrder.push(`save:${savedKey ?? ''}`);
                    return Promise.resolve(undefined);
                }
                if (path === 'settings/service-credentials/test-openai') {
                    callOrder.push('test-openai');
                    return Promise.resolve({ success: true, message: 'OK' });
                }
                return Promise.resolve(undefined);
            }),
            on: vi.fn(() => () => undefined),
        } as never;

        renderCloudTab();

        const keyInput = await screen.findByPlaceholderText('sk-...', {}, { timeout: 3000 });
        fireEvent.change(keyInput, { target: { value: 'sk-unsaved-draft-key' } });

        const row = screen.getByTestId('model-row-deepseek-chat');
        fireEvent.click(within(row).getByRole('button', { name: 'Test' }));

        await waitFor(() => expect(callOrder).toContain('test-openai'), { timeout: 3000 });
        expect(callOrder[0]).toBe('save:sk-unsaved-draft-key');
        expect(callOrder.at(-1)).toBe('test-openai');
        expect(keyInput).toHaveValue('');
    });
});
