import React from 'react';
import { useInRouterContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, PanelLeft } from 'lucide-react';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import useLayout from '@/frontend/app/stores/layoutStore';
import { useAppHistoryNavigation } from '@/frontend/app/hooks/useAppHistoryNavigation';
import { swrApiMutate } from '@/frontend/lib/swr-util';
import useSubtitleScroll from '@/frontend/features/player/hooks/useSubtitleScroll';
import { cn } from '@/frontend/lib/utils';
import { APP_SHELL_TESTIDS } from '@/common/constants/qa-testids';

const NAV_ICON_BUTTON_CLASS = cn(
    'inline-flex items-center justify-center w-[24px] h-[24px] rounded-md select-none transition-colors',
);

const InnerNavigation: React.FC = () => {
    const { t: tPlayer } = useTranslation('player');
    const showSideBar = useLayout((s) => s.showSideBar);
    const changeSideBar = useLayout((s) => s.changeSideBar);
    const {
        canGoBack,
        canGoForward,
        isPlayer,
        backTooltip,
        forwardTooltip,
        goBack,
        goForward,
    } = useAppHistoryNavigation();

    const showHistoryControls = canGoBack || canGoForward || isPlayer;

    if (!showHistoryControls) {
        return null;
    }

    const backEnabled = canGoBack || isPlayer;

    return (
        <div className="no-drag flex items-center h-full gap-[4px] shrink-0">
            <Tooltip content={backTooltip} placement="below">
                <button
                    type="button"
                    data-testid={APP_SHELL_TESTIDS.titleBarBack}
                    disabled={!backEnabled}
                    onClick={goBack}
                    className={cn(
                        NAV_ICON_BUTTON_CLASS,
                        backEnabled
                            ? 'text-secondary/80 hover:text-primary hover:bg-muted/70 active:bg-muted cursor-pointer'
                            : 'text-secondary/35 cursor-default',
                    )}
                    aria-label={backTooltip}
                >
                    <ArrowLeft className="w-[14px] h-[14px]" />
                </button>
            </Tooltip>

            {(canGoBack || canGoForward) && (
                <Tooltip content={forwardTooltip} placement="below">
                    <button
                        type="button"
                        data-testid={APP_SHELL_TESTIDS.titleBarForward}
                        disabled={!canGoForward}
                        onClick={goForward}
                        className={cn(
                            NAV_ICON_BUTTON_CLASS,
                            canGoForward
                                ? 'text-secondary/80 hover:text-primary hover:bg-muted/70 active:bg-muted cursor-pointer'
                                : 'text-secondary/35 cursor-default',
                        )}
                        aria-label={forwardTooltip}
                    >
                        <ArrowRight className="w-[14px] h-[14px]" />
                    </button>
                </Tooltip>
            )}

            {isPlayer && (
                <Tooltip
                    content={
                        showSideBar
                            ? tPlayer('controlButton.closePanel', { defaultValue: '收起侧栏' })
                            : tPlayer('controlButton.openPanel', { defaultValue: '展开侧栏' })
                    }
                    placement="below"
                >
                    <button
                        type="button"
                        onClick={async () => {
                            useSubtitleScroll.getState().pauseMeasurement();
                            await swrApiMutate('watch-history/list');
                            changeSideBar(!showSideBar);
                        }}
                        className={cn(
                            NAV_ICON_BUTTON_CLASS,
                            'cursor-pointer',
                            showSideBar
                                ? 'text-accent bg-accent-bg/15 hover:bg-accent-bg/25'
                                : 'text-secondary/80 hover:text-primary hover:bg-muted/70 active:bg-muted',
                        )}
                        aria-label={showSideBar ? tPlayer('controlButton.closePanel') : tPlayer('controlButton.openPanel')}
                    >
                        <PanelLeft className="w-[14px] h-[14px]" />
                    </button>
                </Tooltip>
            )}
        </div>
    );
};

/**
 * 桌面端统一标题栏导航控制组。
 *
 * 规范化交互设计：
 * - 在顶栏左侧提供基于全局路由历史栈的后退/前进按钮，跨模块跳入（如 精读/语境工坊 ↔ 播放、播放 ↔ 设置）可一键原路返回；
 * - 播放器内无历史栈兜底时保留「返回媒体库」，并附带「展开/收起侧栏」开关；
 * - 在非 Router 启动门槛环境下安全静默，不引发 context 异常。
 */
export const TitleBarNavigation: React.FC = () => {
    const inRouter = useInRouterContext();
    if (!inRouter) {
        return null;
    }
    return <InnerNavigation />;
};

export default TitleBarNavigation;
