/* eslint-disable react-hooks/refs -- Astryx usePopover 把 triggerRef/triggerProps/render 作为渲染期 API 返回，会被 refs 规则误判 */
import { useCallback, useMemo, useState } from 'react';
import { AudioLines, ChevronRight, Eraser, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { VStack } from '@astryxdesign/core/VStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';

import { usePopover } from '@astryxdesign/core/Popover';

import { cn } from '@/frontend/lib/utils';
import {
    CONTROL_POPOVER_PANEL,
} from '@/frontend/features/player/components/ControlPopover';
import { playerApi } from '@/frontend/features/player/playerApi';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlayerUi } from '@/frontend/features/player/playerUiStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import useLayout from '@/frontend/app/stores/layoutStore';
import { setPodcastModeForCurrentVideo } from '@/frontend/features/player/podcastMode';
import { formatSubtitleTrackOptions } from '@/frontend/features/player/lib/subtitleTrackLabels';
import { useSourceChineseAvailability } from '@/frontend/features/player/hooks/useSourceChineseAvailability';
import { useSubtitleTrackActions } from '@/frontend/features/player/hooks/useSubtitleTrackActions';
import useSetting from '@/frontend/features/settings/settingsStore';
import { PopoverSwitchRow } from './PopoverSwitchRow';
import TimeAdjustPanel from './TimeAdjustPanel';
import {
    TOOLBAR_ICON_BUTTON,
    TOOLBAR_TONE,
    type ToolbarTone,
} from './toolbarStyles';

/**
 * 播放控制快速面板（播放台遥控器）。
 *
 * 遵循极简遥控器交互定位：
 * 1. 主选项卡只收纳 3~4 项高频即时干预项（整句显示、悬停查词暂停、自动播放下一集，及自带源字幕中文）；
 * 2. 避免与字幕条左侧的 EN/中/双语分段开关重复；低频或非即时项由底部「全部播放设置」承接；
 * 3. 顶层分段切换「常规」与「字幕时间」，高度压缩至约 190px，任何小视口下彻底杜绝滚动条。
 *
 * @param tone 宿主底色：字幕面板或视频画面深色条。
 * @param popoverOffset 弹窗底边到按钮顶边的间距。
 * @param onMenuOpenChange 展开状态变化时回调：宿主控制条据此保持可见。
 */
export default function PlayerSettingsPopover({
    tone,
    popoverOffset,
    onMenuOpenChange,
}: {
    tone: ToolbarTone;
    popoverOffset: number;
    onMenuOpenChange?: (open: boolean) => void;
}) {
    const { t } = useI18nTranslation('player');
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'settings' | 'timing'>('settings');
    const [confirmingRestore, setConfirmingRestore] = useState(false);

    const handlePopoverShow = useCallback(() => {
        onMenuOpenChange?.(true);
    }, [onMenuOpenChange]);
    const handlePopoverHide = useCallback(() => {
        setActiveTab('settings');
        setConfirmingRestore(false);
        onMenuOpenChange?.(false);
    }, [onMenuOpenChange]);
    const popover = usePopover({
        // 与 TrainingMenuButton 统一为 340px，并预留窄屏余量，避免英文与不同主题字体撑破弹层。
        className: cn('w-[340px] max-w-[calc(100vw-2rem)] max-h-[min(70vh,480px)] overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full p-2.5', CONTROL_POPOVER_PANEL),
        hasSurface: false,
        isModal: false,
        dialogLabel: t('controlBox.title'),
        onShow: handlePopoverShow,
        onHide: handlePopoverHide,
    });

    const showCn = usePlayerUi((s) => s.showCn);
    const showSourceZh = usePlayerUi((s) => s.showSourceZh);
    const subtitleContext = usePlayerUi((s) => s.subtitleContext);
    const setSubtitleContext = usePlayerUi((s) => s.setSubtitleContext);
    const changeShowSourceZh = usePlayerUi((s) => s.changeShowSourceZh);
    const sourceZhAvailable = useSourceChineseAvailability();
    const podcastMode = useLayout((s) => s.podcastMode);

    const pauseOnWordHover = useSetting((s) => s.values.get('player.pauseOnWordHover')) === 'true';
    const vocabularyGuidance = useSetting((s) => s.values.get('player.vocabularyGuidance') ?? 'calm');
    const adaptiveChinese = useSetting((s) => s.values.get('player.adaptiveChinese') ?? 'true') === 'true';
    const sceneCues = useSetting((s) => s.values.get('player.sceneCues') ?? 'false') === 'true';
    const autoRefineWithLocalAsr = useSetting((s) => s.values.get('subtitle.autoRefineWithLocalAsr') ?? 'true') !== 'false';
    const setSetting = useSetting((s) => s.setSetting);

    const autoPlayNext = useSetting((s) => s.values.get('player.autoPlayNext')) === 'true';
    const currentSentence = usePlayer((s) => s.currentSentence);
    const srtTender = usePlayer((s) => s.srtTender);
    const adjustDiff = currentSentence && srtTender && srtTender.adjusted(currentSentence)
        ? srtTender.timeDiff(currentSentence)
        : null;
    const timingBadgeSeconds = adjustDiff
        ? (Math.abs(adjustDiff.start) >= 0.05
            ? adjustDiff.start
            : (Math.abs(adjustDiff.end) >= 0.05 ? adjustDiff.end : null))
        : null;
    const isOverlayHost = tone === 'overlay';
    const hasVisibleChinese = showCn || (showSourceZh && sourceZhAvailable);
    const trackActions = useSubtitleTrackActions();
    const trackOptions = useMemo(
        () => formatSubtitleTrackOptions(trackActions.subtitleTracks, trackActions.originLabel),
        [trackActions.originLabel, trackActions.subtitleTracks],
    );

    const style = TOOLBAR_TONE[tone];

    const changePauseOnWordHover = async (next: boolean) => {
        await setSetting('player.pauseOnWordHover', next ? 'true' : 'false');
    };

    const changeAutoPlayNext = async (next: boolean) => {
        await setSetting('player.autoPlayNext', next ? 'true' : 'false');
    };

    const changeVocabularyGuidance = async (next: string) => {
        await setSetting('player.vocabularyGuidance', next);
    };

    const changeAdaptiveChinese = async (next: boolean) => {
        await setSetting('player.adaptiveChinese', next ? 'true' : 'false');
    };

    const changeSceneCues = async (next: boolean) => {
        await setSetting('player.sceneCues', next ? 'true' : 'false');
    };

    const changeAutoRefineWithLocalAsr = async (next: boolean) => {
        await setSetting('subtitle.autoRefineWithLocalAsr', next ? 'true' : 'false');
    };

    return (
        <>
            <Tooltip content={t('controlBox.title')} placement="above">
                <button
                    type="button"
                    ref={popover.triggerRef}
                    onClick={popover.toggle}
                    {...popover.triggerProps}
                    aria-label={t('controlBox.title')}
                    className={cn(
                        TOOLBAR_ICON_BUTTON,
                        style.idle
                    )}
                >
                    <SlidersHorizontal className="w-4 h-4" />
                </button>
            </Tooltip>
            {popover.render(
                <>
                {/* 顶部分段切换器：精简文案为 常规 / 字幕时间 */}
                <div className="pb-2">
                    <SegmentedControl
                        value={activeTab}
                        onChange={(val) => setActiveTab(val as 'settings' | 'timing')}
                        label={t('controlBox.title')}
                        size="sm"
                        layout="fill"
                    >
                        <SegmentedControlItem
                            value="settings"
                            label={t('controlBox.tabGeneral', { defaultValue: '常规' })}
                        />
                        <SegmentedControlItem
                            value="timing"
                            label={
                                timingBadgeSeconds !== null
                                    ? `${t('controlBox.tabTiming', { defaultValue: '字幕时间' })} (${timingBadgeSeconds >= 0 ? '+' : ''}${timingBadgeSeconds.toFixed(1)}s)`
                                    : t('controlBox.tabTiming', { defaultValue: '字幕时间' })
                            }
                        />
                    </SegmentedControl>
                </div>

                {activeTab === 'settings' ? (
                    <div className="space-y-1.5">
                        {/* 高频即时开关：全屏条旁已有独立播客按钮且不渲染场景路标，不透出重复或无效开关 */}
                        <VStack gap={0.5}>
                            <PopoverSwitchRow
                                label={t('controlBox.pauseOnWordHover')}
                                labelTooltip={t('controlBox.pauseOnWordHoverHint')}
                                checked={pauseOnWordHover}
                                onChange={(next) => { void changePauseOnWordHover(next); }}
                                testId="player-setting-pause-on-hover"
                            />
                            <PopoverSwitchRow
                                label={t('controlBox.autoPlayNext')}
                                labelTooltip={t('controlBox.autoPlayNextHint')}
                                checked={autoPlayNext}
                                onChange={(next) => { void changeAutoPlayNext(next); }}
                                testId="player-setting-auto-play-next"
                            />
                            {!isOverlayHost && (
                                <PopoverSwitchRow
                                    label={t('controlBox.podcastMode')}
                                    labelTooltip={t('controlBox.podcastModeHint')}
                                    checked={podcastMode}
                                    onChange={(checked) => setPodcastModeForCurrentVideo(checked)}
                                    testId="player-setting-podcast-mode"
                                />
                            )}
                            {sourceZhAvailable && (
                                <PopoverSwitchRow
                                    label={t('controlBox.showSourceZh')}
                                    labelTooltip={t('controlBox.showSourceZhHint')}
                                    checked={showSourceZh}
                                    onChange={() => changeShowSourceZh()}
                                    testId="player-setting-show-source-zh"
                                />
                            )}
                            {hasVisibleChinese && (
                                <PopoverSwitchRow
                                    label={t('controlBox.adaptiveChinese')}
                                    labelTooltip={t('controlBox.adaptiveChineseHint')}
                                    checked={adaptiveChinese}
                                    onChange={(next) => { void changeAdaptiveChinese(next); }}
                                    testId="player-setting-adaptive-chinese"
                                />
                            )}
                            {!isOverlayHost && (
                                <PopoverSwitchRow
                                    label={t('controlBox.sceneCues')}
                                    labelTooltip={t('controlBox.sceneCuesHint')}
                                    checked={sceneCues}
                                    onChange={(next) => { void changeSceneCues(next); }}
                                    testId="player-setting-scene-cues"
                                />
                            )}
                        </VStack>

                        {/* 显示范围：只影响主字幕区渲染哪几句，不影响复读/暂停的单位。
                            分段控件必须 shrink-0：Astryx 的段标签 min-width:0 且可收缩，
                            在 flex 行里被挤压就会渲染成「关…/安…」这样的省略号。 */}
                        <div className="flex items-center justify-between gap-2 px-2 py-1">
                            <span
                                className="shrink-0 whitespace-nowrap text-sm text-secondary"
                                title={t('controlBox.subtitleContextHint')}
                            >
                                {t('controlBox.subtitleContext')}
                            </span>
                            <div className="shrink-0">
                                <SegmentedControl
                                    value={subtitleContext}
                                    onChange={(next) => setSubtitleContext(next as 'sentence' | 'context')}
                                    label={t('controlBox.subtitleContext')}
                                    size="sm"
                                >
                                    <SegmentedControlItem
                                        value="sentence"
                                        label={t('controlBox.subtitleContextSentence')}
                                    />
                                    <SegmentedControlItem
                                        value="context"
                                        label={t('controlBox.subtitleContextWith')}
                                    />
                                </SegmentedControl>
                            </div>
                        </div>

                        {/* 4 项分段控件在英文等较长语种下与左侧标题同行必定溢出，改为上下排布并等宽铺满，
                            保证全语种与全主题下四档均清晰可点且不截断。 */}
                        <div className="flex flex-col items-stretch gap-1.5 px-2 py-1">
                            <span
                                className="text-sm text-secondary"
                                title={t('controlBox.vocabularyGuidanceHint')}
                            >
                                {t('controlBox.vocabularyGuidance')}
                            </span>
                            <div className="w-full shrink-0">
                                <SegmentedControl
                                    value={vocabularyGuidance}
                                    onChange={(next) => { void changeVocabularyGuidance(next); }}
                                    label={t('controlBox.vocabularyGuidance')}
                                    layout="fill"
                                    size="sm"
                                >
                                    <SegmentedControlItem
                                        value="off"
                                        label={t('controlBox.vocabularyGuidanceOff')}
                                    />
                                    <SegmentedControlItem
                                        value="calm"
                                        label={t('controlBox.vocabularyGuidanceCalm')}
                                    />
                                    <SegmentedControlItem
                                        value="coach"
                                        label={t('controlBox.vocabularyGuidanceCoach')}
                                    />
                                    <SegmentedControlItem
                                        value="intensive"
                                        label={t('controlBox.vocabularyGuidanceIntensive')}
                                    />
                                </SegmentedControl>
                            </div>
                        </div>

                        {/* 底部跳转完整系统设置 */}
                        <button
                            type="button"
                            onClick={() => {
                                popover.hide();
                                navigate('/settings/appearance');
                            }}
                            className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-secondary transition-colors hover:bg-muted/40 hover:text-primary cursor-pointer"
                        >
                            <span className="flex items-center gap-1.5">
                                <Settings2 className="h-3.5 w-3.5 text-secondary group-hover:text-primary transition-colors" />
                                <span>{t('controlBox.allSettings', { defaultValue: '全部播放设置' })}</span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-secondary group-hover:text-primary transition-colors" />
                        </button>
                    </div>
                ) : (
                    /* 字幕轨道、本地重识与时间微调选项卡 */
                    <div className="space-y-2.5 pt-1">
                        {trackActions.subtitlePath && (
                            <>
                                <div className="space-y-1.5 px-1" data-testid="player-subtitle-track-section">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="shrink-0 whitespace-nowrap text-sm text-secondary">
                                            {t('subtitleOrigin.trackLabel')}
                                        </span>
                                        {trackActions.subtitleOrigin && (
                                            <span className="text-metadata text-secondary truncate">
                                                {trackActions.originLabel(trackActions.subtitleOrigin)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {trackOptions.length > 1 && (
                                            <div className="w-full min-w-0 [--text-body-size:var(--text-supporting-size)]">
                                                <Selector
                                                    label={t('subtitleOrigin.trackLabel')}
                                                    isLabelHidden
                                                    size="sm"
                                                    width="100%"
                                                    value={trackActions.subtitlePath}
                                                    onChange={(val) => {
                                                        setConfirmingRestore(false);
                                                        void trackActions.switchTrack(val);
                                                    }}
                                                    isDisabled={
                                                        trackActions.switchingTrack
                                                        || trackActions.discardingEdited
                                                        || trackActions.isGenerating
                                                    }
                                                    options={trackOptions}
                                                />
                                            </div>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            width="100%"
                                            icon={trackActions.isGenerating ? undefined : <AudioLines className="h-3.5 w-3.5" />}
                                            isDisabled={
                                                trackActions.discardingEdited
                                                || trackActions.cancelling
                                                || (trackActions.isGenerating && trackActions.taskId === undefined)
                                            }
                                            label={trackActions.isGenerating
                                                ? t('subtitleGeneration.cancel')
                                                : t('subtitleOrigin.regenerate')}
                                            onClick={() => {
                                                if (trackActions.isGenerating) {
                                                    void trackActions.cancelGeneration();
                                                } else {
                                                    void trackActions.regenerateLocalSubtitle();
                                                }
                                            }}
                                        />
                                        {trackActions.editedTrack && trackActions.baselineTrack && (
                                            confirmingRestore ? (
                                                <div
                                                    className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 p-2"
                                                    data-testid="player-restore-baseline-confirm-box"
                                                >
                                                    <span className="text-metadata text-secondary">
                                                        {t('subtitleOrigin.restoreConfirmHint')}
                                                    </span>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            data-testid="player-restore-baseline-cancel"
                                                            isDisabled={trackActions.discardingEdited}
                                                            label={t('sideSentence.cancelEdit')}
                                                            onClick={() => setConfirmingRestore(false)}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            data-testid="player-restore-baseline-confirm"
                                                            isLoading={trackActions.discardingEdited}
                                                            isDisabled={trackActions.discardingEdited || trackActions.isGenerating}
                                                            label={t('subtitleOrigin.restoreConfirmAction')}
                                                            onClick={() => {
                                                                void trackActions.discardEditedTrack().then((ok) => {
                                                                    if (ok) {
                                                                        setConfirmingRestore(false);
                                                                    }
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    width="100%"
                                                    data-testid="player-restore-baseline-subtitle"
                                                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                                                    isDisabled={
                                                        trackActions.discardingEdited
                                                        || trackActions.switchingTrack
                                                        || trackActions.isGenerating
                                                    }
                                                    label={trackActions.baselineTrack.origin === 'local_asr'
                                                        ? t('subtitleOrigin.restoreToLocal')
                                                        : t('subtitleOrigin.restoreToBaseline')}
                                                    onClick={() => setConfirmingRestore(true)}
                                                />
                                            )
                                        )}
                                    </div>
                                    {trackActions.isGenerating && (
                                        <p className="text-metadata text-secondary truncate" role="status" aria-live="polite">
                                            {trackActions.generationProgress ?? t('subtitleGeneration.running')}
                                        </p>
                                    )}
                                    <PopoverSwitchRow
                                        label={t('subtitleOrigin.autoRefineToggle')}
                                        labelTooltip={t('subtitleOrigin.autoRefineToggleHint')}
                                        checked={autoRefineWithLocalAsr}
                                        onChange={(next) => { void changeAutoRefineWithLocalAsr(next); }}
                                        testId="player-setting-auto-refine-subtitle"
                                    />
                                </div>
                                <Divider variant="subtle" />
                            </>
                        )}

                        <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                            <TimeAdjustPanel />
                        </div>

                        <Divider variant="subtle" />

                        <Button
                            variant="ghost"
                            size="sm"
                            width="100%"
                            label={t('clearAdjust.button')}
                            icon={<Eraser className="h-4 w-4" />}
                            tooltip={t('clearAdjust.tooltipSubtitle')}
                            onClick={() => {
                                const fileHash = usePlaybackSession.getState().srtHash;
                                if (!fileHash) return;
                                void playerApi.deleteTimestampAdjustment(fileHash).then(() => {
                                    usePlaybackSession.getState().reloadSubtitles();
                                    toast(t('clearAdjust.done'), { icon: '👏' });
                                });
                            }}
                        />
                    </div>
                )}
                </>,
                { placement: 'above', alignment: 'end', offset: popoverOffset },
            )}
        </>
    );
}
