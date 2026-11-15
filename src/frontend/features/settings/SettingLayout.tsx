import { Outlet, useLocation } from 'react-router-dom';
import React, { useMemo } from 'react';
import {
    Boxes,
    Command,
    Globe,
    HardDrive,
    Info,
    Palette,
    Settings,
    Smartphone,
    SquarePlay,
} from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import {
    Layout,
    LayoutContent,
    LayoutPanel,
} from '@astryxdesign/core/Layout';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Icon, type IconType } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/VStack';
import { SETTINGS_NAV_TESTIDS, SETTINGS_SIDEBAR_TESTID } from '@/common/constants/qa-testids';

/** 设置页面各分区键名联合类型。 */
export type SettingType =
    | 'appearance'
    | 'shortcut'
    | 'resources'
    | 'import'
    | 'proxy'
    | 'storage'
    | 'mobile'
    | 'about';

/** 侧边栏导航条目定义。 */
interface SettingNavDef {
    key: SettingType;
    icon: React.ElementType;
    labelKey: string;
}

/** 侧边栏语义分组定义。 */
interface SettingNavGroup {
    id: string;
    titleKey: string;
    defaultTitle: string;
    items: SettingNavDef[];
}

/**
 * 设置菜单语义分组：
 * 1. 常用偏好：外观置于首项，与 `/settings` 默认落地页保持一致；
 * 2. 能力与连接：将服务资源、YouTube 导入与网络代理相邻编排，缩短排查链路；
 * 3. 数据与系统：存储备份、局域网访问与关于更新收尾。
 */
const SETTING_GROUPS: SettingNavGroup[] = [
    {
        id: 'general',
        titleKey: 'sectionGroups.general',
        defaultTitle: '常用偏好',
        items: [
            { key: 'appearance', icon: Palette, labelKey: 'sections.appearance' },
            { key: 'shortcut', icon: Command, labelKey: 'sections.shortcut' },
        ],
    },
    {
        id: 'capabilities',
        titleKey: 'sectionGroups.capabilities',
        defaultTitle: '能力与连接',
        items: [
            { key: 'resources', icon: Boxes, labelKey: 'sections.resources' },
            { key: 'import', icon: SquarePlay, labelKey: 'sections.import' },
            { key: 'proxy', icon: Globe, labelKey: 'sections.proxy' },
        ],
    },
    {
        id: 'system',
        titleKey: 'sectionGroups.system',
        defaultTitle: '数据与系统',
        items: [
            { key: 'storage', icon: HardDrive, labelKey: 'sections.storage' },
            { key: 'mobile', icon: Smartphone, labelKey: 'sections.mobile' },
            { key: 'about', icon: Info, labelKey: 'sections.about' },
        ],
    },
];

const SETTING_ITEMS: SettingNavDef[] = SETTING_GROUPS.flatMap((group) => group.items);

/**
 * 设置中心主从布局：左侧分区导航，右侧内容。
 *
 * 按 Astryx `settings`（Settings - Form）模板组织：页面壳由外层 AppShell 提供，
 * 这里只用 Layout 的 start/content 两槽位。分区位置由左侧常驻 SideNav 的选中态
 * 与各页自己的 h2 标题表达，因此不再放面包屑——Breadcrumbs 规范要求「不要用在
 * 无父级的顶层页、只是补充主导航」，在这里既冗余又多出一条横线。
 * AppShell 已经渲染唯一的 <main>，这里不再重复声明 main landmark。
 *
 * @returns 设置中心布局 JSX 元素。
 */
const SettingLayout: React.FC = () => {
    const { t } = useI18nTranslation('settings');
    const location = useLocation();

    const currentKey = useMemo<SettingType>(() => {
        const segments = location.pathname.split('/');
        const matched = SETTING_ITEMS.find((item) => segments.includes(item.key));
        return matched ? matched.key : 'appearance';
    }, [location.pathname]);

    return (
        <Layout
            height="fill"
            start={
                <LayoutPanel width={240} isScrollable={false} hasDivider padding={2}>
                    <aside data-testid={SETTINGS_SIDEBAR_TESTID} className="h-full flex flex-col w-full">
                        {/* SideNav 默认固定 260px，而面板内容区只有 224px，
                            不拉满会撑出横向滚动条 */}
                        <div className="w-full [&_.astryx-side-nav]:!w-full">
                            <SideNav
                                header={
                                    <SideNavHeading
                                        heading={t('layoutTitle')}
                                        icon={<Icon icon={Settings as unknown as IconType} size="sm" />}
                                    />
                                }
                            >
                                <VStack gap={3} width="100%">
                                    {SETTING_GROUPS.map((group) => (
                                        <SideNavSection
                                            key={group.id}
                                            title={t(group.titleKey, { defaultValue: group.defaultTitle })}
                                        >
                                            {group.items.map((item) => (
                                                <SideNavItem
                                                    key={item.key}
                                                    data-testid={SETTINGS_NAV_TESTIDS[item.key]}
                                                    label={t(item.labelKey)}
                                                    icon={
                                                        <Icon
                                                            icon={item.icon as unknown as IconType}
                                                            size="sm"
                                                            color={currentKey === item.key ? 'primary' : 'secondary'}
                                                        />
                                                    }
                                                    isSelected={currentKey === item.key}
                                                    href={`/settings/${item.key}`}
                                                />
                                            ))}
                                        </SideNavSection>
                                    ))}
                                </VStack>
                            </SideNav>
                        </div>
                    </aside>
                </LayoutPanel>
            }
            content={
                <LayoutContent padding={6} isScrollable>
                    <VStack width="100%" maxWidth={780} gap={6} paddingBlockEnd={8} className="mx-auto">
                        <Outlet />
                    </VStack>
                </LayoutContent>
            }
        />
    );
};

export default SettingLayout;
