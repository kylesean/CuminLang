import React from 'react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { codeBlock } from 'common-tags';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import {
    BookOpen,
    Copy,
    ExternalLink,
    FolderOpen,
    Info,
    RefreshCw,
    Tag,
    ZoomIn,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon, type IconType } from '@astryxdesign/core/Icon';
import { Lightbox, type LightboxMedia } from '@astryxdesign/core/Lightbox';
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { Banner } from '@astryxdesign/core/Banner';

import { AUTHOR_SUPPORT_CONTACT } from '@/common/constants/author-support';
import Md from '@/frontend/components/shared/markdown/Markdown';
import { writeTextToClipboard } from '@/frontend/lib/clipboard';
import { settingsApi } from '@/frontend/features/settings/settingsApi';
import type { UpdateCheckResult } from '@/common/types/update-check';
import useSetting from '@/frontend/features/settings/settingsStore';
import SettingsPageShell from '@/frontend/features/settings/components/form/SettingsPageShell';
import { SettingField, SettingSection } from '@/frontend/features/settings/components/form';
import wordmark from '../../../../assets/brand/refrain/wordmark.svg';
import wordmarkReverse from '../../../../assets/brand/refrain/wordmark-reverse.svg';
import wechatPayQr from '../../../../assets/support/wechat-pay-qr.jpg';
import douyinQr from '../../../../assets/support/douyin-qr.jpg';

/**
 * 关于与更新设置面板
 *
 * 展示当前应用版本、更新检测、更新日志以及官方资源与开源协议链接。
 */
const AboutSetting: React.FC = () => {
    const { t } = useI18nTranslation('settings');
    const theme = useSetting((s) => s.values.get('appearance.theme'));

    const { data: currentVersion = '' } = useSWR<string>(
        'system/app-version',
        async () => {
            return await settingsApi.getAppVersion().catch(() => '');
        },
        {
            fallbackData: '',
            revalidateOnFocus: false,
        }
    );

    const {
        data: updateResult,
        error: checkError,
        isLoading: checking,
        isValidating,
        mutate: recheckUpdate,
    } = useSWR<UpdateCheckResult>(
        'system/check-update',
        async () => {
            return await settingsApi.checkUpdate();
        },
        {
            revalidateOnFocus: false,
        }
    );

    const isCheckingUpdate = checking || isValidating;
    const hasNewRelease = (updateResult?.releases?.length ?? 0) > 0;
    const hasError = Boolean(checkError) || updateResult?.status === 'error';

    const errorText = checkError
        ? (checkError instanceof Error ? checkError.message : String(checkError))
        : updateResult?.error
            ? t(`about.update.errors.${updateResult.error}`, {
                defaultValue: t(`checkUpdate.errors.${updateResult.error}`, {
                    defaultValue: t('about.update.failedDescription', {
                        defaultValue: t('checkUpdate.failedDescription'),
                    }),
                }),
            })
            : t('about.update.failedDescription', { defaultValue: t('checkUpdate.failedDescription') });

    const [supportLightboxIndex, setSupportLightboxIndex] = React.useState<number | null>(null);

    const openUrl = async (url: string) => {
        try {
            await settingsApi.openUrl(url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const openLogsFolder = async () => {
        try {
            await settingsApi.openLogsFolder();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('No handler registered')) {
                toast.error(t('about.links.openLogsRestartRequired', {
                    defaultValue: '日志目录服务尚未在主进程生效，请重启 Refrain 应用后再试',
                }));
                return;
            }
            toast.error(message);
        }
    };

    const copyDouyinId = async () => {
        try {
            await writeTextToClipboard(AUTHOR_SUPPORT_CONTACT.douyin);
            toast.success(t('about.links.supportCopied', {
                value: AUTHOR_SUPPORT_CONTACT.douyin,
                defaultValue: `已复制抖音号：${AUTHOR_SUPPORT_CONTACT.douyin}`,
            }));
        } catch {
            toast.error(t('about.links.supportCopyFailed', { defaultValue: '复制失败' }));
        }
    };

    const supportChannels = [
        {
            key: 'wechat',
            title: t('about.links.supportWechatTitle', { defaultValue: '微信赞赏' }),
            description: t('about.links.supportWechatDesc', { defaultValue: '感谢鼓励，完全自愿赞赏' }),
            src: wechatPayQr,
            copyable: false,
        },
        {
            key: 'douyin',
            title: t('about.links.supportDouyinTitle', { defaultValue: '关注抖音' }),
            description: t('about.links.supportDouyinDesc', {
                id: AUTHOR_SUPPORT_CONTACT.douyin,
                defaultValue: `@孜然语言 · 抖音号：${AUTHOR_SUPPORT_CONTACT.douyin}`,
            }),
            src: douyinQr,
            copyable: true,
        },
    ] as const;

    const supportMedia: LightboxMedia[] = supportChannels.map((channel) => ({
        src: channel.src,
        alt: channel.title,
        caption: `${channel.title} · ${channel.description}`,
    }));

    // 依主题模式配置选择图标，不调用 matchMedia，遵从 Electron IPC 注入的主题类名
    const isDark = theme === 'dark' || (theme !== 'light' && typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

    return (
        <SettingsPageShell
            title={t('about.title', { defaultValue: '关于与更新' })}
            description={t('about.slogan', {
                defaultValue: '精选 YouTube 英语视频，AI 原生的沉浸式学习',
            })}
        >
            <SettingSection
                title={t('about.appInfoTitle', { defaultValue: '产品信息' })}
                description={t('about.appInfoDescription', { defaultValue: '了解 Refrain 的版本与更新状态' })}
                icon={Info as unknown as IconType}
            >
                <Card variant="default" padding={4}>
                    <HStack vAlign="center" justify="between" wrap="wrap" gap={4}>
                        <HStack vAlign="center" gap={3}>
                            <img
                                className="h-10 w-auto object-contain shrink-0"
                                src={isDark ? wordmarkReverse : wordmark}
                                alt={t('about.appName', { defaultValue: 'Refrain' })}
                                draggable={false}
                            />
                            {currentVersion && (
                                <Token
                                    label={`v${currentVersion}`}
                                    size="sm"
                                    color="gray"
                                />
                            )}
                        </HStack>

                        <HStack vAlign="center" gap={2}>
                            <Button
                                label={t('about.update.checkNow', { defaultValue: '检查更新' })}
                                size="sm"
                                variant="secondary"
                                isLoading={isCheckingUpdate}
                                icon={<Icon icon={RefreshCw as unknown as IconType} size="sm" />}
                                onClick={() => recheckUpdate()}
                            />
                            <Button
                                label={t('about.links.releases', { defaultValue: '版本日志' })}
                                size="sm"
                                variant="ghost"
                                icon={<Icon icon={Tag as unknown as IconType} size="sm" />}
                                endContent={<Icon icon={ExternalLink as unknown as IconType} size="xsm" />}
                                onClick={() => openUrl('https://github.com/kylesean/Refrain/releases/latest')}
                            />
                        </HStack>
                    </HStack>
                </Card>

                {checking && !updateResult ? (
                    <Banner
                        status="info"
                        title={t('about.update.checking')}
                    />
                ) : hasError ? (
                    <Banner
                        status="error"
                        title={errorText}
                        endContent={(
                            <Button
                                label={t('about.update.retry')}
                                size="sm"
                                variant="secondary"
                                onClick={() => recheckUpdate()}
                            />
                        )}
                    />
                ) : hasNewRelease ? (
                    <VStack gap={3} width="100%">
                        <HStack vAlign="center" justify="between" gap={3}>
                            <HStack vAlign="center" gap={2}>
                                <Text weight="bold" size="sm">
                                    {t('about.update.newVersionFound')}
                                </Text>
                                <Token
                                    label={updateResult?.releases[0]?.version ?? ''}
                                    size="sm"
                                    color="blue"
                                />
                            </HStack>

                            <Button
                                label={t('about.update.downloadNow')}
                                size="sm"
                                variant="primary"
                                endContent={<Icon icon={ExternalLink as unknown as IconType} size="xsm" />}
                                onClick={() => openUrl(updateResult?.releases[0]?.url || 'https://github.com/kylesean/Refrain/releases/latest')}
                            />
                        </HStack>

                        <Card variant="default" padding={3}>
                            <ScrollableArea label={t('about.update.releaseNotesLabel')} height={192}>
                                <Md>
                                    {(updateResult?.releases ?? []).map((release) => (
                                        codeBlock`
                                        ${release.content}
                                        `
                                    )).join('\n---\n')}
                                </Md>
                            </ScrollableArea>
                        </Card>
                    </VStack>
                ) : (
                    <Banner
                        status="success"
                        title={t('about.update.upToDateTitle', { defaultValue: '当前已是最新版本' })}
                    />
                )}
            </SettingSection>

            <Divider />

            <SettingSection
                title={t('about.resourcesTitle', { defaultValue: '相关资源' })}
                description={t('about.resourcesDescription', { defaultValue: '查阅官方文档、访问开源社区或查看授权协议' })}
                icon={BookOpen as unknown as IconType}
            >
                <SettingField
                    title={t('about.links.docs', { defaultValue: '官方文档' })}
                    description={t('about.links.docsDesc', { defaultValue: '查看完整使用教程与快捷键指南' })}
                >
                    <Button
                        label={t('common.viewDocs', { defaultValue: '查看文档' })}
                        variant="secondary"
                        size="sm"
                        endContent={<Icon icon={ExternalLink as unknown as IconType} size="xsm" />}
                        onClick={() => openUrl('https://kylesean.github.io/Refrain/home.html')}
                    />
                </SettingField>

                <Divider variant="subtle" />

                <SettingField
                    title={t('about.links.github', { defaultValue: 'GitHub 仓库' })}
                    description={t('about.links.githubDesc', { defaultValue: '欢迎提交 Issue、功能建议或给项目点个 Star' })}
                >
                    <Button
                        label="GitHub"
                        variant="secondary"
                        size="sm"
                        endContent={<Icon icon={ExternalLink as unknown as IconType} size="xsm" />}
                        onClick={() => openUrl('https://github.com/kylesean/Refrain')}
                    />
                </SettingField>

                <Divider variant="subtle" />

                <SettingField
                    title={t('about.links.license', { defaultValue: '开源协议' })}
                    description={t('about.links.licenseDesc', { defaultValue: '基于 GNU AGPLv3 自由开源' })}
                >
                    <Button
                        label="GNU AGPLv3"
                        variant="secondary"
                        size="sm"
                        endContent={<Icon icon={ExternalLink as unknown as IconType} size="xsm" />}
                        onClick={() => openUrl('https://github.com/kylesean/Refrain/blob/main/LICENSE')}
                    />
                </SettingField>

                <Divider variant="subtle" />

                <SettingField
                    title={t('about.links.logs', { defaultValue: '运行日志' })}
                    description={t('about.links.logsDesc', { defaultValue: '打开本地日志目录，提交 Bug 反馈时可附带最新日志文件' })}
                >
                    <Button
                        label={t('about.links.openLogs', { defaultValue: '打开日志目录' })}
                        variant="secondary"
                        size="sm"
                        endContent={<Icon icon={FolderOpen as unknown as IconType} size="xsm" />}
                        onClick={openLogsFolder}
                    />
                </SettingField>

                <Divider variant="subtle" />

                <Collapsible
                    defaultIsOpen={false}
                    trigger={(
                        <VStack gap={0.5} className="min-w-0">
                            <Text type="body" weight="medium">
                                {t('about.links.supportAuthor', { defaultValue: '支持作者' })}
                            </Text>
                            <Text type="supporting" color="secondary" className="break-words">
                                {t('about.links.supportAuthorDesc', {
                                    defaultValue: '开源免费使用，点击展开关注或自愿赞赏方式',
                                })}
                            </Text>
                        </VStack>
                    )}
                >
                    <VStack gap={3} width="100%" className="pt-3">
                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                            {supportChannels.map((channel, index) => (
                                <Card key={channel.key} variant="muted" padding={3}>
                                    <VStack gap={2} width="100%" className="h-full justify-between">
                                        <VStack gap={0.5} width="100%">
                                            <Text type="body" weight="semibold">
                                                {channel.title}
                                            </Text>
                                            <Text type="supporting" color="secondary">
                                                {channel.description}
                                            </Text>
                                        </VStack>

                                        <button
                                            type="button"
                                            aria-label={`${channel.title} - ${t('about.links.supportZoomHint', { defaultValue: '点击二维码可放大查看' })}`}
                                            onClick={() => setSupportLightboxIndex(index)}
                                            className="mx-auto block w-fit cursor-pointer overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <img
                                                src={channel.src}
                                                alt={channel.title}
                                                loading="lazy"
                                                draggable={false}
                                                className="block h-56 w-auto max-w-full object-contain"
                                            />
                                        </button>

                                        <HStack justify="between" vAlign="center" width="100%" gap={2} className="min-h-[var(--size-element-sm)]">
                                            <HStack gap={1} vAlign="center">
                                                <Icon icon={ZoomIn as unknown as IconType} size="xsm" color="secondary" />
                                                <Text type="supporting" color="secondary">
                                                    {t('about.links.supportZoomHint', { defaultValue: '点击二维码可放大查看' })}
                                                </Text>
                                            </HStack>
                                            {channel.copyable && (
                                                <Button
                                                    label={t('about.links.supportCopyDouyin', { defaultValue: '复制抖音号' })}
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={<Icon icon={Copy as unknown as IconType} size="xsm" />}
                                                    onClick={() => { void copyDouyinId(); }}
                                                />
                                            )}
                                        </HStack>
                                    </VStack>
                                </Card>
                            ))}
                        </div>
                    </VStack>
                </Collapsible>
            </SettingSection>

            {supportLightboxIndex !== null && (
                <Lightbox
                    isOpen
                    onOpenChange={(isOpen) => {
                        if (!isOpen) {
                            setSupportLightboxIndex(null);
                        }
                    }}
                    index={supportLightboxIndex}
                    onIndexChange={setSupportLightboxIndex}
                    media={supportMedia}
                />
            )}

            <HStack justify="center" paddingBlock={2}>
                <Text type="supporting" color="secondary" justify="center">
                    {t('about.footer', { defaultValue: 'Refrain · 沉浸式英语视频学习桌面应用' })} · GNU AGPLv3
                </Text>
            </HStack>
        </SettingsPageShell>
    );
};

export default AboutSetting;
