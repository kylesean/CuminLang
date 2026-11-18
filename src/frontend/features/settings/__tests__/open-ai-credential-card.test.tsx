import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import type { ServiceCredentialSettingFormValues } from '@/common/types/vo/service-credentials-setting-vo';
import { CLOUD_AI_PROVIDER_PRESETS } from '@/common/constants/cloud-ai-provider-presets';
import { OpenAiCredentialCard } from '../components/OpenAiCredentialCard';

const translationDict: Record<string, string> = {
    'serviceCredentials.openai.usePreset': '使用预设',
    'serviceCredentials.openai.presetDialogTitle': '选择厂商预设',
    'serviceCredentials.openai.useThisPreset': '使用',
    'serviceCredentials.openai.apiFormatLabel': 'API 类型',
    'serviceCredentials.openai.apiFormatOpenai': 'OpenAI Chat Completions',
    'serviceCredentials.openai.apiFormatOpenaiResponses': 'OpenAI Responses',
    'serviceCredentials.openai.apiFormatAnthropic': 'Anthropic',
    'serviceCredentials.openai.apiFormatGemini': 'Gemini',
    'serviceCredentials.openai.urlLabel': 'API URL',
    'serviceCredentials.openai.endpointPlaceholder': 'https://api.deepseek.com/v1',
    'serviceCredentials.openai.customEndpointPlaceholder': 'http://127.0.0.1:8080/v1',
    'serviceCredentials.openai.modelsLabel': '可用模型列表',
    'serviceCredentials.openai.addPlaceholder': '输入模型标识，如 deepseek-flash',
    'serviceCredentials.openai.tableTest': '测试',
    'serviceCredentials.openai.modelEnableLabel': '启用模型 {{model}}',
    'serviceCredentials.openai.modelDisabled': '已关闭',
    'serviceCredentials.openai.saveKey': '保存',
    'serviceCredentials.openai.cancelKeyEdit': '取消',
    'serviceCredentials.openai.clearKey': '清除',
    'serviceCredentials.openai.keySaved': 'API Key 已保存',
    'serviceCredentials.openai.keyCleared': 'API Key 已清除',
    'serviceCredentials.openai.providersLabel': '服务商配置',
    'serviceCredentials.openai.addProvider': '添加配置',
    'serviceCredentials.openai.customProvider': '自定义 / 本地 AI',
    'serviceCredentials.openai.customProviderDescription': '自由填写名称、协议类型与接口地址，适用于本地部署或第三方接口',
    'serviceCredentials.openai.addCustomProvider': '新建',
    'serviceCredentials.openai.addProviderDialogTitle': '添加服务商配置',
    'serviceCredentials.openai.addProviderDialogDescription': '可新建自定义 / 本地 AI 配置，或从下方模板快速创建。',
    'serviceCredentials.openai.deleteProvider': '移除此配置',
    'serviceCredentials.openai.noProvidersHint': '暂未配置服务商',
    'serviceCredentials.openai.providerNameLabel': '配置名称',
    'serviceCredentials.openai.providerNamePlaceholder': '如 DeepSeek、本地 AI',
    'serviceCredentials.openai.copyLink': '复制链接',
    'serviceCredentials.openai.openInBrowser': '在浏览器中打开',
    'common.saveFailed': '保存失败',
    'common.delete': '删除',
    'common.cancel': '取消',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (key === 'serviceCredentials.openai.modelEnableLabel') {
                return `启用模型 ${String(params?.model ?? '')}`;
            }
            if (key === 'serviceCredentials.openai.deleteModelConfirm') {
                return `确定删除模型「${String(params?.model ?? '')}」？`;
            }
            return translationDict[key] ?? key;
        },
    }),
}));

const buildDefaultValues = (
    override?: Partial<{
        activeProviderId: string;
        embeddingModel: string;
        endpoint: string;
        models: string[];
        disabledModels: string[];
        hasKey: boolean;
        keyHint: string;
        providers: ServiceCredentialSettingFormValues['openai']['providers'];
    }>,
): ServiceCredentialSettingFormValues => ({
    openai: {
        embeddingModel: override?.embeddingModel ?? '',
        activeProviderId: override?.activeProviderId ?? 'deepseek',
        providers: override?.providers ?? [
            {
                id: override?.activeProviderId ?? 'deepseek',
                name: 'DeepSeek',
                apiFormat: 'openai',
                endpoint: override?.endpoint ?? '',
                hasKey: override?.hasKey ?? false,
                keyHint: override?.keyHint ?? '',
                key: '',
                clearKey: false,
                models: override?.models ?? [],
                disabledModels: override?.disabledModels ?? [],
            },
        ],
    },
    tencent: {
        hasCredentials: false,
        secretIdHint: '',
        secretId: '',
        secretKey: '',
        clearTencent: false,
    },
});

const renderCard = (
    defaultValues: ServiceCredentialSettingFormValues,
    overrides?: {
        onTestModel?: (model: string, providerId?: string) => void;
        onFlushCredentials?: () => Promise<void>;
    },
) => {
    let latestValues: () => ServiceCredentialSettingFormValues = () => defaultValues;
    const Wrapper: React.FC = () => {
        const form = useForm<ServiceCredentialSettingFormValues>({ defaultValues });
        latestValues = form.getValues;
        return (
            <OpenAiCredentialCard
                form={form}
                testingModel={null}
                testResults={{}}
                onTestModel={overrides?.onTestModel ?? (() => undefined)}
                onModelRemoved={() => undefined}
                onFlushCredentials={overrides?.onFlushCredentials}
                onCopy={() => undefined}
                onOpenUrl={() => undefined}
            />
        );
    };
    return {
        ...render(<Wrapper />),
        getValues: () => latestValues(),
    };
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('OpenAiCredentialCard', () => {
    it('点击「使用预设」打开弹窗并列出全部厂商预设', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues());

        await user.click(screen.getByRole('button', { name: '使用预设' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('选择厂商预设')).toBeInTheDocument();
        for (const preset of CLOUD_AI_PROVIDER_PRESETS) {
            const card = within(dialog).getByTestId(`provider-preset-${preset.id}`);
            expect(within(card).getAllByText(preset.name).length).toBeGreaterThanOrEqual(1);
            expect(within(card).getByText(preset.endpoint)).toBeInTheDocument();
            expect(within(card).getByText(preset.docsUrl)).toBeInTheDocument();
        }
    });

    it('选择 DeepSeek 预设后回填完整接口地址，且不覆盖已有模型列表', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues({
            models: ['existing-model'],
        }));

        await user.click(screen.getByRole('button', { name: '使用预设' }));
        const dialog = await screen.findByRole('dialog');
        const useButtons = within(dialog).getAllByRole('button', { name: '使用' });
        const deepSeekIndex = CLOUD_AI_PROVIDER_PRESETS.findIndex((preset) => preset.id === 'deepseek');
        await user.click(useButtons[deepSeekIndex]);

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByDisplayValue('https://api.deepseek.com/v1')).toBeInTheDocument();
        expect(screen.getByText('existing-model')).toBeInTheDocument();
    });

    it('选择 Anthropic 预设后 API 类型切换为 Anthropic', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues());

        await user.click(screen.getByRole('button', { name: '使用预设' }));
        const dialog = await screen.findByRole('dialog');
        const useButtons = within(dialog).getAllByRole('button', { name: '使用' });
        const anthropicIndex = CLOUD_AI_PROVIDER_PRESETS.findIndex((preset) => preset.id === 'anthropic');
        await user.click(useButtons[anthropicIndex]);

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByRole('combobox')).toHaveTextContent('Anthropic');
        expect(screen.getByDisplayValue('https://api.anthropic.com/v1')).toBeInTheDocument();
    });

    it('支持切换模型启用/关闭状态以及自由删除模型', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues({
            models: ['deepseek-flash'],
            disabledModels: [],
        }));

        const row = screen.getByTestId('model-row-deepseek-flash');
        const toggle = within(row).getByRole('switch', { name: '启用模型 deepseek-flash' });
        await user.click(toggle);
        expect(within(row).getByText('已关闭')).toBeInTheDocument();

        await user.click(within(row).getByRole('button', { name: '删除' }));
        const confirmDialog = await screen.findByRole('alertdialog');
        await user.click(within(confirmDialog).getByRole('button', { name: '删除' }));
        await waitFor(() => expect(screen.queryByTestId('model-row-deepseek-flash')).not.toBeInTheDocument());
    });

    it('API Key 输入后需点击保存才生效，支持取消与清除防误触', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues());

        const keyInput = screen.getByPlaceholderText('sk-...');
        await user.type(keyInput, 'sk-accidental');
        await user.click(screen.getByRole('button', { name: '取消' }));
        expect(keyInput).toHaveValue('');

        await user.type(keyInput, 'sk-real-key-1234');
        await user.click(screen.getByRole('button', { name: '保存' }));
        expect(keyInput).toHaveValue('');
        expect(screen.getByRole('button', { name: '清除' })).toBeInTheDocument();
    });

    it('支持添加多个服务商并在不同服务商之间独立切换', async () => {
        const user = userEvent.setup();
        renderCard(buildDefaultValues({
            activeProviderId: 'deepseek',
            providers: [
                {
                    id: 'deepseek',
                    name: 'DeepSeek',
                    apiFormat: 'openai',
                    endpoint: 'https://api.deepseek.com/v1',
                    hasKey: false,
                    keyHint: '',
                    key: '',
                    clearKey: false,
                    models: ['deepseek-flash'],
                    disabledModels: [],
                },
            ],
        }));

        await user.click(screen.getByRole('button', { name: '添加配置' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByTestId('provider-preset-custom')).toBeInTheDocument();
        const useButtons = within(dialog).getAllByRole('button', { name: '使用' });
        const openaiIndex = CLOUD_AI_PROVIDER_PRESETS.findIndex((preset) => preset.id === 'openai');
        await user.click(useButtons[openaiIndex]);

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByDisplayValue('https://api.openai.com/v1')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toHaveTextContent('OpenAI Responses');
        expect(screen.queryByTestId('model-row-deepseek-flash')).not.toBeInTheDocument();

        // 切回 DeepSeek，原有模型列表独立保留
        await user.click(screen.getByTestId('provider-tab-deepseek'));
        expect(screen.getByDisplayValue('https://api.deepseek.com/v1')).toBeInTheDocument();
        expect(screen.getByTestId('model-row-deepseek-flash')).toBeInTheDocument();

        // 可删到最后一个服务商并展示空状态提示
        await user.click(screen.getByRole('button', { name: '移除此配置' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除' }));
        await user.click(screen.getByRole('button', { name: '移除此配置' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除' }));
        expect(screen.getByText('暂未配置服务商')).toBeInTheDocument();
    });

    it('保存或清除 API Key 必须等待落盘 IPC 完成后才提示成功，失败时回滚并保留输入', async () => {
        const user = userEvent.setup();
        const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => '');
        const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '');

        let resolveFlush!: () => void;
        let rejectFlush!: (err: Error) => void;
        let callCount = 0;
        const onFlushCredentials = vi.fn(() => {
            callCount += 1;
            if (callCount === 1) {
                return new Promise<void>((_, reject) => {
                    rejectFlush = reject;
                });
            }
            return new Promise<void>((resolve) => {
                resolveFlush = resolve;
            });
        });

        const { getValues } = renderCard(buildDefaultValues(), { onFlushCredentials });
        const keyInput = screen.getByPlaceholderText('sk-...');
        await user.type(keyInput, 'sk-pending-1234');
        await user.click(screen.getByRole('button', { name: '保存' }));

        // 在途期间未提前弹出成功提示
        expect(onFlushCredentials).toHaveBeenCalledTimes(1);
        expect(successSpy).not.toHaveBeenCalled();

        // 首次落盘失败：不弹成功提示、保留草稿、并把表单状态回滚到未保存前
        rejectFlush(new Error('disk full'));
        await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
        expect(successSpy).not.toHaveBeenCalled();
        expect(keyInput).toHaveValue('sk-pending-1234');
        expect(getValues().openai.providers[0]?.hasKey).toBe(false);

        // 重试并落盘成功：落盘完成前仍未弹成功，落盘完成后清空草稿并弹成功提示
        await user.click(screen.getByRole('button', { name: '保存' }));
        expect(successSpy).not.toHaveBeenCalled();
        resolveFlush();
        await waitFor(() => expect(successSpy).toHaveBeenCalledWith('API Key 已保存'));
        expect(keyInput).toHaveValue('');
        expect(getValues().openai.providers[0]?.hasKey).toBe(true);

        // 清除 Key 同样等待落盘完成，失败时不误报已清除
        callCount = 0;
        await user.click(screen.getByRole('button', { name: '清除' }));
        expect(successSpy).toHaveBeenCalledTimes(1);
        rejectFlush(new Error('save failed'));
        await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));
        expect(successSpy).toHaveBeenCalledTimes(1);
        expect(getValues().openai.providers[0]?.hasKey).toBe(true);
    });

    it('输入 API Key 后直接点击测试会先提交草稿并等待落盘，再触发模型连通性测试', async () => {
        const user = userEvent.setup();
        const events: string[] = [];
        let flushedKey = '';
        let getValuesRef: (() => ServiceCredentialSettingFormValues) | null = null;
        const onFlushCredentials = vi.fn(async () => {
            flushedKey = getValuesRef?.().openai.providers[0]?.key ?? '';
            events.push(`flush:${flushedKey}`);
        });
        const onTestModel = vi.fn((model: string) => {
            events.push(`test:${model}`);
        });

        const rendered = renderCard(buildDefaultValues({
            endpoint: 'https://api.deepseek.com/v1',
            models: ['deepseek-chat'],
        }), { onFlushCredentials, onTestModel });
        getValuesRef = rendered.getValues;

        const keyInput = screen.getByPlaceholderText('sk-...');
        await user.type(keyInput, 'sk-direct-test-9999');

        const row = screen.getByTestId('model-row-deepseek-chat');
        await user.click(within(row).getByRole('button', { name: '测试' }));

        await waitFor(() => expect(onTestModel).toHaveBeenCalledWith('deepseek-chat', 'deepseek'));
        expect(events).toEqual(['flush:sk-direct-test-9999', 'test:deepseek-chat']);
        expect(keyInput).toHaveValue('');
    });

    it('保存密钥在途期间切换服务商标签并修改其他字段，保存失败只回滚原服务商密钥，不串台也不丢并发编辑', async () => {
        const user = userEvent.setup();
        vi.spyOn(toast, 'success').mockImplementation(() => '');
        const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '');

        let rejectFlush!: (err: Error) => void;
        const onFlushCredentials = vi.fn(() => new Promise<void>((_, reject) => {
            rejectFlush = reject;
        }));

        const { getValues } = renderCard(buildDefaultValues({
            activeProviderId: 'deepseek',
            endpoint: 'https://api.deepseek.com/v1',
            providers: [
                {
                    id: 'deepseek',
                    name: 'DeepSeek',
                    apiFormat: 'openai',
                    endpoint: 'https://api.deepseek.com/v1',
                    hasKey: false,
                    keyHint: '',
                    key: '',
                    clearKey: false,
                    models: ['deepseek-chat'],
                    disabledModels: [],
                },
                {
                    id: 'openai',
                    name: 'OpenAI',
                    apiFormat: 'openai-responses',
                    endpoint: 'https://api.openai.com/v1',
                    hasKey: true,
                    keyHint: '••••8888',
                    key: '',
                    clearKey: false,
                    models: ['gpt-4o'],
                    disabledModels: [],
                },
            ],
        }), { onFlushCredentials });

        const keyInput = screen.getByPlaceholderText('sk-...');
        await user.type(keyInput, 'sk-deepseek-failing');
        await user.click(screen.getByRole('button', { name: '保存' }));
        expect(onFlushCredentials).toHaveBeenCalledTimes(1);

        // 保存仍在途时切到 OpenAI 标签，并修改 OpenAI 的接口地址
        await user.click(screen.getByTestId('provider-tab-openai'));
        const endpointInput = screen.getByDisplayValue('https://api.openai.com/v1');
        await user.clear(endpointInput);
        await user.type(endpointInput, 'https://proxy.openai.example/v1');

        // DeepSeek 的保存请求失败：应只回滚 DeepSeek 的凭据，不切回标签，不覆盖 OpenAI 的当前值与编辑
        rejectFlush(new Error('network error'));
        await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));

        const values = getValues();
        expect(values.openai.activeProviderId).toBe('openai');
        const deepseek = values.openai.providers?.find((p) => p.id === 'deepseek');
        const openai = values.openai.providers?.find((p) => p.id === 'openai');
        expect(deepseek?.hasKey).toBe(false);
        expect(deepseek?.key).toBe('');
        expect(openai?.hasKey).toBe(true);
        expect(openai?.keyHint).toBe('••••8888');
        expect(openai?.endpoint).toBe('https://proxy.openai.example/v1');
        expect(screen.getByDisplayValue('https://proxy.openai.example/v1')).toBeInTheDocument();
    });
});
