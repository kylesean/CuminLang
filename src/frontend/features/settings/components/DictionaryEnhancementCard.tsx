import { useRef, useState, useSyncExternalStore } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';
import { toast } from 'react-hot-toast';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Download, Globe, RefreshCw, Square, Trash2 } from 'lucide-react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon, type IconType } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import type { DpTask, DpTaskProgressMeta } from '@/common/contracts/dp-task';
import type { EnglishDictionaryStatusVO } from '@/common/contracts/english-dictionary';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import { localizeBackendMessage } from '@/frontend/i18n/backendErrorLocalizer';
import { formatDpTaskProgress } from '@/frontend/i18n/dpTaskProgress';
import { englishDictionaryApi } from '@/frontend/features/settings/englishDictionaryApi';
import { SettingField } from '@/frontend/features/settings/components/form/SettingSection';

/** SWR 缓存键。 */
const STATUS_KEY = 'dictionary-enhancement/status';

interface ActiveInstallState {
    taskId: number | null;
    progress: string | null;
    progressMeta: DpTaskProgressMeta | null;
}

/** 跨组件卸载保留当前安装任务状态，避免切换设置页签后丢失取消句柄与进度文本。 */
let activeInstallState: ActiveInstallState = { taskId: null, progress: null, progressMeta: null };
const installStateListeners = new Set<() => void>();

function subscribeInstallState(listener: () => void): () => void {
    installStateListeners.add(listener);
    return () => {
        installStateListeners.delete(listener);
    };
}

function getInstallStateSnapshot(): ActiveInstallState {
    return activeInstallState;
}

function updateActiveInstallState(next: ActiveInstallState): void {
    activeInstallState = next;
    installStateListeners.forEach((listener) => listener());
}

/**
 * 英英释义增强包的安装/删除卡片。
 *
 * 与语音资源包卡片保持一致的交互规范：单行一键下载并配置、进度条展示、
 * 就绪状态徽标 + 垃圾桶删除，以及失败时引导重试或配置网络代理。
 */
export default function DictionaryEnhancementCard({
    onOpenProxySettings,
}: {
    onOpenProxySettings?: () => void;
}) {
    const { t } = useI18nTranslation('settings');
    const { data: status, mutate } = useSWR<EnglishDictionaryStatusVO>(STATUS_KEY, englishDictionaryApi.status);
    const { taskId, progress: rawProgress, progressMeta } = useSyncExternalStore(
        subscribeInstallState,
        getInstallStateSnapshot,
        getInstallStateSnapshot,
    );
    const progress = formatDpTaskProgress({ progress: rawProgress, progressMeta });
    const [localError, setLocalError] = useState<string | null>(null);
    /** 删除增强包的确认弹窗是否打开。 */
    const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const actionInFlightRef = useRef(false);

    /** 启动安装并订阅任务进度。 */
    const install = async (): Promise<void> => {
        if (actionInFlightRef.current) return;
        actionInFlightRef.current = true;
        setInstalling(true);
        setLocalError(null);
        let settled = false;
        let registeredTaskId: number | null = null;
        try {
            const id = await useDpTaskCenter.getState().register(
                () => englishDictionaryApi.install(),
                {
                    onUpdated: (task: DpTask) => {
                        if (settled) return;
                        updateActiveInstallState({
                            taskId: registeredTaskId ?? activeInstallState.taskId,
                            progress: task.progress ?? null,
                            progressMeta: task.progressMeta ?? null,
                        });
                    },
                    onFinish: () => {
                        settled = true;
                        updateActiveInstallState({ taskId: null, progress: null, progressMeta: null });
                        void swrMutate(STATUS_KEY);
                    },
                },
            );
            registeredTaskId = id;
            if (!settled) {
                updateActiveInstallState({
                    taskId: id,
                    progress: activeInstallState.progress,
                    progressMeta: activeInstallState.progressMeta,
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setLocalError(message);
            toast.error(t('resources.dictionaryEnhancement.installFailed', { message }));
        } finally {
            actionInFlightRef.current = false;
            setInstalling(false);
        }
    };

    /** 取消安装。 */
    const cancel = async (): Promise<void> => {
        if (taskId === null || actionInFlightRef.current) return;
        actionInFlightRef.current = true;
        setCancelling(true);
        try {
            await englishDictionaryApi.cancel(taskId);
        } catch (error) {
            toast.error(t('resources.dictionaryEnhancement.installFailed', {
                message: error instanceof Error ? error.message : String(error),
            }));
        } finally {
            actionInFlightRef.current = false;
            setCancelling(false);
        }
    };

    /** 删除已安装的增强包；确认由 AlertDialog 统一承担。 */
    const remove = async (): Promise<boolean> => {
        try {
            await englishDictionaryApi.remove();
            setLocalError(null);
            await mutate();
            return true;
        } catch (error) {
            toast.error(t('resources.dictionaryEnhancement.removeFailed', {
                message: error instanceof Error ? error.message : String(error),
            }));
            return false;
        }
    };

    const downloading = taskId !== null || Boolean(status?.downloading);
    const rawError = !downloading ? (localError || status?.error || null) : null;
    const displayError = rawError ? localizeBackendMessage(rawError) : null;

    return (
        <VStack gap={3} width="100%">
            <SettingField
                title={t('resources.dictionaryEnhancement.title')}
                description={status?.installed
                    ? t('resources.dictionaryEnhancement.installed')
                    : t('resources.dictionaryEnhancement.description')}
            >
                {downloading ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        isLoading={cancelling}
                        isDisabled={taskId === null || cancelling}
                        label={t('resources.pack.cancel')}
                        icon={<Icon icon={Square as unknown as IconType} size="sm" />}
                        onClick={() => void cancel()}
                    />
                ) : status?.installed ? (
                    <>
                        <Token label={t('resources.pack.itemReady')} size="sm" color="green" />
                        <IconButton
                            label={t('resources.pack.itemDelete')}
                            tooltip={t('resources.pack.itemDelete')}
                            size="sm"
                            variant="ghost"
                            isDisabled={removing}
                            icon={<Icon icon={Trash2 as unknown as IconType} size="sm" />}
                            onClick={() => setRemoveConfirmOpen(true)}
                        />
                    </>
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        isLoading={installing}
                        isDisabled={removing}
                        label={t('resources.pack.itemDownload')}
                        icon={<Icon icon={Download as unknown as IconType} size="sm" />}
                        onClick={() => void install()}
                    />
                )}
            </SettingField>

            {downloading && (
                <VStack gap={1.5} width="100%">
                    <ProgressBar
                        label={t('resources.dictionaryEnhancement.title')}
                        isIndeterminate
                        isLabelHidden
                    />
                    <Text type="supporting" color="secondary">
                        {progress ?? t('resources.dictionaryEnhancement.downloading')}
                    </Text>
                </VStack>
            )}

            {displayError && (
                <VStack gap={2} width="100%">
                    <Banner
                        status="error"
                        title={t('resources.dictionaryEnhancement.installFailed', { message: displayError })}
                        description={t('resources.pack.proxyHint')}
                    />
                    <HStack gap={2} wrap="wrap">
                        <Button
                            size="sm"
                            variant="secondary"
                            label={t('resources.pack.retry')}
                            icon={<Icon icon={RefreshCw as unknown as IconType} size="sm" />}
                            onClick={() => void install()}
                        />
                        {onOpenProxySettings && (
                            <Button
                                size="sm"
                                variant="secondary"
                                label={t('resources.pack.openProxySettings')}
                                icon={<Icon icon={Globe as unknown as IconType} size="sm" />}
                                onClick={onOpenProxySettings}
                            />
                        )}
                    </HStack>
                </VStack>
            )}

            <AlertDialog
                isOpen={removeConfirmOpen}
                onOpenChange={setRemoveConfirmOpen}
                title={t('resources.dictionaryEnhancement.remove')}
                description={t('resources.dictionaryEnhancement.removeConfirm')}
                actionLabel={t('resources.dictionaryEnhancement.remove')}
                cancelLabel={t('common.cancel', { defaultValue: '取消' })}
                actionVariant="destructive"
                isActionLoading={removing}
                onAction={async () => {
                    if (removing || actionInFlightRef.current) return;
                    actionInFlightRef.current = true;
                    setRemoving(true);
                    try {
                        if (await remove()) {
                            setRemoveConfirmOpen(false);
                        }
                    } finally {
                        actionInFlightRef.current = false;
                        setRemoving(false);
                    }
                }}
            />
        </VStack>
    );
}
