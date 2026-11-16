import React from 'react';
import { toast } from 'react-hot-toast';
import type { KeyedMutator } from 'swr';
import type { TFunction } from 'i18next';
import { settingsApi } from '@/frontend/features/settings/settingsApi';
import type { TranscriptionEngine } from '@/common/contracts/transcription-engine';

type ResourceStatus = Awaited<ReturnType<typeof settingsApi.getResourceStatus>>;

export interface ServiceResourceActionsOptions {
    /** 设置页命名空间的翻译函数。 */
    t: TFunction;
    /** 资源状态 SWR 的 mutate。 */
    refreshResourceStatus: KeyedMutator<ResourceStatus>;
    /** 云端密钥表单的即时落盘；测试连通性前必须先保存。 */
    flushCredentials: () => Promise<void>;
    /** 当前哪些缓存会被"清空缓存"命中。 */
    cacheTargets: { subtitle: boolean; dictionary: boolean };
}

/**
 * 服务与资源页的动作层：译/识引擎切换、缓存清理、AI 模型连通性测试。
 */
export function useServiceResourceActions({
    t,
    refreshResourceStatus,
    flushCredentials,
    cacheTargets,
}: ServiceResourceActionsOptions) {
    const mountedRef = React.useRef(true);
    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // 模型连通性测试
    const [testingOpenAiModel, setTestingOpenAiModel] = React.useState<string | null>(null);
    const [openAiTestResults, setOpenAiTestResults] = React.useState<Record<string, {
        success: boolean;
        message: string;
    } | null>>({});
    const testingOpenAiModelsRef = React.useRef(new Set<string>());
    const openAiEpochRef = React.useRef(new Map<string, number>());

    const [clearingCache, setClearingCache] = React.useState(false);
    const clearingCacheRef = React.useRef(false);
    /** 清缓存确认弹窗是否打开。 */
    const [cacheConfirmOpen, setCacheConfirmOpen] = React.useState(false);

    const changeTranscriptionEngine = async (engine: TranscriptionEngine) => {
        try {
            await settingsApi.saveTranscriptionEngine(engine);
            await refreshResourceStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const clearCaches = async () => {
        if (clearingCacheRef.current) return false;
        clearingCacheRef.current = true;
        setClearingCache(true);
        try {
            const [subtitle, dictionary] = await Promise.all([
                cacheTargets.subtitle ? settingsApi.clearSubtitleTranslationCache() : { deleted: 0 },
                cacheTargets.dictionary ? settingsApi.clearDictionaryCache() : { deleted: 0 },
            ]);
            toast.success(t('resources.preference.clearCacheDone', {
                count: subtitle.deleted + dictionary.deleted,
            }));
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
            return false;
        } finally {
            clearingCacheRef.current = false;
            if (mountedRef.current) {
                setClearingCache(false);
            }
        }
    };

    const copyText = async (value: string) => {
        try {
            if (settingsApi.copyText) {
                await settingsApi.copyText(value);
            } else {
                await navigator.clipboard.writeText(value);
            }
            toast.success(t('common.copied'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const openUrl = async (url: string) => {
        try {
            await settingsApi.openUrl(url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const openFolder = async (path?: string) => {
        if (!path) return;
        try {
            await settingsApi.openFolderForFile(path);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    /** 模型被删除后清掉它的连通性测试结果，并递增值代数使在途测试响应失效。 */
    const forgetOpenAiTestResult = (model: string, providerId?: string) => {
        const resultKey = providerId ? `${providerId}:${model}` : model;
        openAiEpochRef.current.set(resultKey, (openAiEpochRef.current.get(resultKey) ?? 0) + 1);
        testingOpenAiModelsRef.current.delete(resultKey);
        setTestingOpenAiModel((current) => (current === resultKey || current === model ? null : current));
        setOpenAiTestResults((prev) => {
            const next = { ...prev };
            delete next[resultKey];
            if (resultKey !== model) {
                delete next[model];
            }
            return next;
        });
    };

    const testOpenAiModel = async (model: string, providerId?: string) => {
        const resultKey = providerId ? `${providerId}:${model}` : model;
        if (testingOpenAiModelsRef.current.has(resultKey)) return;
        const epoch = (openAiEpochRef.current.get(resultKey) ?? 0) + 1;
        openAiEpochRef.current.set(resultKey, epoch);
        testingOpenAiModelsRef.current.add(resultKey);

        try {
            await flushCredentials();
        } catch (flushError) {
            testingOpenAiModelsRef.current.delete(resultKey);
            toast.error(`${t('common.saveFailed')}\n${flushError instanceof Error ? flushError.message : String(flushError)}`);
            return;
        }

        if (openAiEpochRef.current.get(resultKey) !== epoch || !mountedRef.current) {
            testingOpenAiModelsRef.current.delete(resultKey);
            return;
        }

        setTestingOpenAiModel(resultKey);
        setOpenAiTestResults((prev) => ({ ...prev, [resultKey]: null }));
        try {
            const result = await settingsApi.testOpenAi(model, providerId);
            if (openAiEpochRef.current.get(resultKey) !== epoch || !mountedRef.current) {
                return;
            }
            setOpenAiTestResults((prev) => ({ ...prev, [resultKey]: result }));
        } catch (error) {
            if (openAiEpochRef.current.get(resultKey) !== epoch || !mountedRef.current) {
                return;
            }
            setOpenAiTestResults((prev) => ({
                ...prev,
                [resultKey]: { success: false, message: error instanceof Error ? error.message : String(error) },
            }));
        } finally {
            testingOpenAiModelsRef.current.delete(resultKey);
            if (mountedRef.current && openAiEpochRef.current.get(resultKey) === epoch) {
                setTestingOpenAiModel((current) => (current === resultKey ? null : current));
            }
        }
    };

    return {
        testingOpenAiModel,
        openAiTestResults,
        clearingCache,
        cacheConfirmOpen,
        setCacheConfirmOpen,
        changeTranscriptionEngine,
        clearCaches,
        copyText,
        openUrl,
        openFolder,
        testOpenAiModel,
        forgetOpenAiTestResult,
    };
}
