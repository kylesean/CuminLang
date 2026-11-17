/* eslint-disable react-hooks/refs -- Astryx usePopover 把 triggerRef/triggerProps/render 作为渲染期 API 返回，会被 refs 规则误判 */
import { useEffect } from 'react';
import { cn } from "@/frontend/lib/utils";
import { usePopover } from '@astryxdesign/core/Popover';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import useSetting from '@/frontend/features/settings/settingsStore';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import {
    CONTROL_POPOVER_PANEL,
    CONTROL_POPOVER_SEPARATOR,
    ControlPopoverRow,
} from '@/frontend/features/player/components/ControlPopover';

export interface SpeedSliderProps {
    speed: number;
    onSpeedChange: (speed: number) => void;
    onSelectFinish?: () => void;
    /** 弹层开关状态变化回调，供宿主悬浮控制条保持常显避免指针移入弹层时条面淡出。 */
    onMenuOpenChange?: (open: boolean) => void;
    /**
     * 触发按钮在宿主控制条上的外观。
     * 默认跟随应用主题的 hover 是给亮色宿主（播客控制条）用的；恒为深色的视频控制条要传
     * DARK_BAR_BUTTON_HOVER，否则浅色主题下 hover 会退化成「背景加暗 + 文字转黑」，
     * 且会漏掉 Astryx ghost 变体自带的 hover 文字色。
     */
    triggerClassName?: string;
    /** 弹窗底边到按钮顶边的间距，按宿主控制条形状取
     *  CONTROL_POPOVER_OFFSET_STACKED_BAR / _SINGLE_ROW_BAR，避免弹窗压住本条进度条 */
    popoverOffset: number;
}

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const SpeedSlider = ({ speed, onSpeedChange, onSelectFinish, onMenuOpenChange, triggerClassName, popoverOffset }: SpeedSliderProps) => {
    const { t } = useI18nTranslation('player');
    const popover = usePopover({
        className: cn('w-56', CONTROL_POPOVER_PANEL),
        hasSurface: false,
        isModal: false,
        dialogLabel: t('speedSlider.title', { defaultValue: '播放速度' }),
    });

    useEffect(() => {
        onMenuOpenChange?.(popover.isOpen);
    }, [popover.isOpen, onMenuOpenChange]);

    // 订阅 settingMap 变化，确保勾选状态即时响应
    const rawStack = useSetting((s) => s.setting('userSelect.playbackRateStack'));
    const setSetting = useSetting((s) => s.setSetting);

    const favoriteList = rawStack
        .split(',')
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));

    const toggleFavorite = (num: number, checked: boolean) => {
        let arr = [...favoriteList];
        if (checked) {
            if (!arr.includes(num)) arr.push(num);
        } else {
            arr = arr.filter((v) => v !== num);
        }
        setSetting('userSelect.playbackRateStack', arr.join(','));
    };

    return (
        <>
            <Button
                ref={popover.triggerRef}
                onClick={popover.toggle}
                {...popover.triggerProps}
                size="sm"
                variant="ghost"
                label={`${speed.toFixed(2)}x`}
                className={cn(
                    // 默认 hover 跟随应用主题（亮色宿主）；深色控制条由 triggerClassName 覆盖
                    'h-8 px-2.5 rounded-lg text-sm font-mono text-inherit hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current',
                    triggerClassName
                )}
            />
            {popover.render(
                <>
                <div className="flex flex-col max-h-72 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-rounded-full">
                    {SPEED_PRESETS.map((num) => {
                        const isSelected = Math.abs(speed - num) < 0.001;
                        const isFavorite = favoriteList.includes(num);
                        return (
                            <ControlPopoverRow
                                key={num}
                                checked={isSelected}
                                emphasize={isSelected}
                                className="font-mono"
                                label={`${num.toFixed(2)}x`}
                                onActivate={() => {
                                    popover.hide();
                                    onSpeedChange(num);
                                    onSelectFinish?.();
                                }}
                                right={
                                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 仅阻止冒泡以免误触发整行的 onActivate，本身不是可交互控件
                                    <div className="flex items-center pl-2" onClick={(e) => e.stopPropagation()}>
                                        <Tooltip
                                            content={t('speedSlider.favoriteHint', {
                                                shortcut: useSetting.getState().setting('shortcut.nextPlaybackRate'),
                                            })}
                                            placement="end"
                                        >
                                            <div className="flex items-center">
                                                <CheckboxInput
                                                    value={isFavorite}
                                                    onChange={(checked) => {
                                                        toggleFavorite(num, checked);
                                                    }}
                                                    label={`${num}x favorite`}
                                                    isLabelHidden
                                                    size="sm"
                                                    id={`speed-check-${num}`}
                                                />
                                            </div>
                                        </Tooltip>
                                    </div>
                                }
                            />
                        );
                    })}
                </div>

                <div className={CONTROL_POPOVER_SEPARATOR} />
                <div className="flex items-center justify-between gap-2 px-1 pt-2">
                    <span className="text-sm text-secondary font-sans shrink-0">{t('speedSlider.custom')}</span>
                    <div className="w-28 shrink-0 [--text-body-size:var(--text-supporting-size)] [--text-body-leading:var(--text-supporting-leading)]">
                        <NumberInput
                            label={t('speedSlider.custom')}
                            isLabelHidden
                            size="sm"
                            width="100%"
                            min={0.25}
                            max={20}
                            step={0.25}
                            units="x"
                            value={speed}
                            onChange={(val) => {
                                const clamped = Math.min(20, Math.max(0.25, Number(val.toFixed(2))));
                                onSpeedChange(clamped);
                            }}
                        />
                    </div>
                </div>
                </>,
                { placement: 'above', alignment: 'center', offset: popoverOffset },
            )}
        </>
    );
};

export default SpeedSlider;
