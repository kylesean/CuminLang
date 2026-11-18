import React, { useEffect, useMemo, useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Divider } from '@astryxdesign/core/Divider';
import { Kbd } from '@astryxdesign/core/Kbd';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
    AudioLines,
    BookOpenText,
    ChevronLeft,
    ChevronRight,
    Compass,
    Cpu,
    Download,
    ExternalLink,
    HelpCircle,
    Layers,
    Menu,
    Mic,
    MonitorPlay,
    Moon,
    Palette,
    Play,
    Search,
    Sun,
    X,
    Captions,
} from 'lucide-react';
import { themes, type ThemeSlug } from '../../src/astryx-themes';
import brandIconUrl from '../../assets/icons/icon.svg';
import {
    DOCS_CONTENT,
    THEME_SHOWCASE_LIST,
    type DocLang,
    type DocSection,
    type DocSectionId,
} from './data/docsContent';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Compass,
    MonitorPlay,
    Captions,
    BookOpenText,
    Cpu,
    Download,
    Play,
    AudioLines,
    Mic,
    Layers,
    Palette,
    HelpCircle,
};

const renderIcon = (name: string, className = 'h-4 w-4') => {
    const Comp = ICON_MAP[name] ?? Compass;
    return <Comp className={className} />;
};

const resolveInitialSection = (): DocSectionId => {
    const hash = window.location.hash.replace(/^#/, '') as DocSectionId;
    const valid = DOCS_CONTENT['zh-CN'].some((s) => s.id === hash);
    return valid ? hash : 'overview';
};

export default function App() {
    const [lang, setLang] = useState<DocLang>('zh-CN');
    const [themeSlug, setThemeSlug] = useState<ThemeSlug>('dp-matcha');
    const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
    const [activeSectionId, setActiveSectionId] = useState<DocSectionId>(resolveInitialSection);
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string; caption: string } | null>(null);

    const isDarkOnlyTheme = themeSlug === 'dp-gothic';
    const effectiveMode: 'light' | 'dark' = isDarkOnlyTheme ? 'dark' : colorMode;

    useEffect(() => {
        document.documentElement.classList.toggle('dark', effectiveMode === 'dark');
        document.documentElement.style.colorScheme = effectiveMode;
    }, [effectiveMode]);

    useEffect(() => {
        const onHashChange = () => {
            setActiveSectionId(resolveInitialSection());
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    useEffect(() => {
        if (!lightboxImage) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setLightboxImage(null);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [lightboxImage]);

    const sections = DOCS_CONTENT[lang];

    const filteredSections = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sections;
        return sections.filter((section) => {
            if (
                section.title.toLowerCase().includes(q)
                || section.subtitle.toLowerCase().includes(q)
            ) {
                return true;
            }
            return section.blocks.some(
                (block) =>
                    block.heading.toLowerCase().includes(q)
                    || block.paragraphs?.some((p) => p.toLowerCase().includes(q))
                    || block.bullets?.some((b) => b.toLowerCase().includes(q)),
            );
        });
    }, [sections, searchQuery]);

    const activeIndex = sections.findIndex((s) => s.id === activeSectionId);
    const activeSection: DocSection = sections[activeIndex >= 0 ? activeIndex : 0];
    const prevSection = activeIndex > 0 ? sections[activeIndex - 1] : null;
    const nextSection = activeIndex >= 0 && activeIndex < sections.length - 1 ? sections[activeIndex + 1] : null;

    const selectSection = (id: DocSectionId) => {
        setActiveSectionId(id);
        setMobileMenuOpen(false);
        if (window.location.hash !== `#${id}`) {
            window.history.replaceState(null, '', `#${id}`);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <Theme theme={themes[themeSlug]} mode={effectiveMode}>
            <div className="min-h-screen bg-body text-primary flex flex-col">
                {/* Sticky Top Header */}
                <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-primary lg:hidden"
                                onClick={() => setMobileMenuOpen((prev) => !prev)}
                                aria-label={lang === 'zh-CN' ? '切换导航菜单' : 'Toggle navigation'}
                            >
                                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                            </button>

                            <a
                                href="#overview"
                                onClick={(e) => {
                                    e.preventDefault();
                                    selectSection('overview');
                                }}
                                className="flex items-center gap-2.5 text-primary no-underline"
                            >
                                <img src={brandIconUrl} alt="CuminLang" className="h-7 w-7 rounded-md" />
                                <span className="text-lg font-semibold tracking-tight">CuminLang</span>
                            </a>
                            <Badge variant="neutral" label="v1.0.0" />
                            <span className="hidden md:inline text-sm text-secondary truncate">
                                {lang === 'zh-CN' ? '产品文档' : 'Documentation'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <div className="hidden sm:block w-48">
                                <TextInput
                                    size="sm"
                                    type="search"
                                    label={lang === 'zh-CN' ? '搜索文档章节' : 'Filter docs'}
                                    isLabelHidden
                                    value={searchQuery}
                                    onChange={(val) => setSearchQuery(val)}
                                    placeholder={lang === 'zh-CN' ? '搜索文档章节...' : 'Filter docs...'}
                                    startIcon={<Search className="h-3.5 w-3.5 text-secondary" />}
                                />
                            </div>

                            <SegmentedControl
                                size="sm"
                                label={lang === 'zh-CN' ? '文档语言' : 'Language'}
                                value={lang}
                                onChange={(val) => setLang(val as DocLang)}
                            >
                                <SegmentedControlItem value="zh-CN" label="中文" />
                                <SegmentedControlItem value="en-US" label="EN" />
                            </SegmentedControl>

                            <select
                                aria-label={lang === 'zh-CN' ? '选择主题风格' : 'Select theme'}
                                value={themeSlug}
                                onChange={(e) => setThemeSlug(e.target.value as ThemeSlug)}
                                className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-primary focus:outline-none"
                            >
                                {THEME_SHOWCASE_LIST.map((item) => (
                                    <option key={item.slug} value={item.slug}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>

                            <Button
                                size="sm"
                                variant="secondary"
                                isIconOnly
                                isDisabled={isDarkOnlyTheme}
                                icon={effectiveMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                label={effectiveMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                onClick={() => setColorMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                            />

                            <a
                                href="https://github.com/kylesean/CuminLang/releases/tag/v1.0.0"
                                target="_blank"
                                rel="noreferrer"
                                className="hidden md:inline-flex items-center gap-1.5 rounded-md bg-accent-bg px-3 py-1.5 text-sm font-medium text-on-accent no-underline transition-opacity hover:opacity-90"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span>{lang === 'zh-CN' ? '下载 v1.0.0' : 'Download'}</span>
                            </a>
                        </div>
                    </div>
                </header>

                {/* Mobile Navigation Drawer */}
                {mobileMenuOpen && (
                    <div className="border-b border-border bg-surface px-4 py-3 lg:hidden">
                        <div className="mb-3">
                            <TextInput
                                size="sm"
                                type="search"
                                label={lang === 'zh-CN' ? '搜索文档章节' : 'Filter docs'}
                                isLabelHidden
                                value={searchQuery}
                                onChange={(val) => setSearchQuery(val)}
                                placeholder={lang === 'zh-CN' ? '搜索文档章节...' : 'Filter docs...'}
                                startIcon={<Search className="h-3.5 w-3.5 text-secondary" />}
                            />
                        </div>
                        <nav className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {filteredSections.map((section) => {
                                const isActive = section.id === activeSection.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => selectSection(section.id)}
                                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                            isActive
                                                ? 'bg-accent-bg text-on-accent font-medium'
                                                : 'text-primary hover:bg-muted'
                                        }`}
                                    >
                                        {renderIcon(section.icon, 'h-4 w-4 shrink-0')}
                                        <span className="truncate">{section.shortTitle}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                )}

                {/* Main 3-Column Documentation Layout */}
                <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6">
                    {/* Left Sidebar Navigation */}
                    <aside className="hidden w-60 shrink-0 lg:block">
                        <div className="sticky top-20 space-y-6">
                            <div>
                                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                                    {lang === 'zh-CN' ? '文档目录' : 'Contents'}
                                </p>
                                <nav className="space-y-1">
                                    {filteredSections.map((section) => {
                                        const isActive = section.id === activeSection.id;
                                        return (
                                            <button
                                                key={section.id}
                                                type="button"
                                                onClick={() => selectSection(section.id)}
                                                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                                                    isActive
                                                        ? 'bg-accent-bg text-on-accent font-medium'
                                                        : 'text-secondary hover:bg-muted hover:text-primary'
                                                }`}
                                            >
                                                <span className="flex items-center gap-2 min-w-0">
                                                    {renderIcon(section.icon, 'h-4 w-4 shrink-0')}
                                                    <span className="truncate">{section.shortTitle}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </nav>
                            </div>

                            <Divider />

                            <div className="space-y-2 px-2 text-sm">
                                <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                                    {lang === 'zh-CN' ? '相关链接' : 'Links'}
                                </p>
                                <a
                                    href="https://github.com/kylesean/CuminLang"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-secondary hover:text-primary no-underline"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>GitHub Repository</span>
                                </a>
                                <a
                                    href="https://github.com/kylesean/CuminLang/releases"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-secondary hover:text-primary no-underline"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    <span>{lang === 'zh-CN' ? '所有发行版' : 'All Releases'}</span>
                                </a>
                            </div>
                        </div>
                    </aside>

                    {/* Center Article Content */}
                    <main className="min-w-0 flex-1 max-w-3xl">
                        {/* Section Header */}
                        <div className="mb-8 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-primary">
                                    {renderIcon(activeSection.icon, 'h-4 w-4')}
                                </span>
                                {activeSection.badge && <Badge variant="neutral" label={activeSection.badge} />}
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">
                                {activeSection.title}
                            </h1>
                            <p className="text-base text-secondary leading-relaxed">
                                {activeSection.subtitle}
                            </p>
                        </div>

                        {/* Highlights Grid (Overview Hero) */}
                        {activeSection.highlights && activeSection.highlights.length > 0 && (
                            <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {activeSection.highlights.map((item) => (
                                    <Card key={item.title} padding={4}>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                                                {renderIcon(item.icon, 'h-4 w-4')}
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-sm font-semibold text-primary">{item.title}</h3>
                                                <p className="text-sm text-secondary leading-relaxed">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Interactive 7-Theme Picker inside Themes Section */}
                        {activeSection.id === 'themes' && (
                            <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {THEME_SHOWCASE_LIST.map((item) => {
                                    const isSelected = themeSlug === item.slug;
                                    return (
                                        <ClickableCard
                                            key={item.slug}
                                            label={item.name}
                                            padding={4}
                                            onClick={() => setThemeSlug(item.slug)}
                                            className={isSelected ? 'ring-2 ring-focus-ring' : ''}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span
                                                        className="h-4 w-4 shrink-0 rounded-full border border-border"
                                                        style={{ backgroundColor: item.swatch }}
                                                    />
                                                    <span className="text-sm font-semibold text-primary">
                                                        {item.name}
                                                    </span>
                                                    {item.darkOnly && (
                                                        <Badge
                                                            variant="neutral"
                                                            label={lang === 'zh-CN' ? '仅深色' : 'Dark Only'}
                                                        />
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <Badge
                                                        variant="success"
                                                        label={lang === 'zh-CN' ? '当前预览' : 'Active'}
                                                    />
                                                )}
                                            </div>
                                            <p className="mt-2 text-sm text-secondary">
                                                {lang === 'zh-CN' ? item.summaryZh : item.summaryEn}
                                            </p>
                                        </ClickableCard>
                                    );
                                })}
                            </div>
                        )}

                        {/* Content Blocks */}
                        <div className="space-y-10">
                            {activeSection.blocks.map((block) => (
                                <section key={block.id} id={block.id} className="scroll-mt-24 space-y-4">
                                    <h2 className="text-lg font-semibold text-primary border-b border-border/60 pb-2">
                                        {block.heading}
                                    </h2>

                                    {block.paragraphs?.map((para, idx) => (
                                        <p key={idx} className="text-base text-primary/90 leading-relaxed">
                                            {para}
                                        </p>
                                    ))}

                                    {block.bullets && block.bullets.length > 0 && (
                                        <ul className="space-y-2 pl-5 list-disc text-base text-primary/90">
                                            {block.bullets.map((bullet, idx) => (
                                                <li key={idx} className="leading-relaxed">
                                                    {bullet}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {block.callout && (
                                        <Banner
                                            status={block.callout.status}
                                            title={block.callout.title}
                                            description={block.callout.description}
                                            collapsible={false}
                                        />
                                    )}

                                    {block.table && (
                                        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                                            <table className="w-full border-collapse text-left text-sm">
                                                <thead>
                                                    <tr className="border-b border-border bg-muted">
                                                        {block.table.headers.map((header) => (
                                                            <th
                                                                key={header}
                                                                className="px-4 py-2.5 font-semibold text-primary"
                                                            >
                                                                {header}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/70">
                                                    {block.table.rows.map((row, rowIdx) => (
                                                        <tr key={rowIdx} className="hover:bg-muted/40">
                                                            {row.map((cell, cellIdx) => (
                                                                <td
                                                                    key={cellIdx}
                                                                    className={`px-4 py-2.5 align-top ${
                                                                        cellIdx === 0
                                                                            ? 'font-medium text-primary whitespace-nowrap'
                                                                            : 'text-secondary'
                                                                    }`}
                                                                >
                                                                    {cell}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {block.shortcuts && block.shortcuts.length > 0 && (
                                        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
                                            {block.shortcuts.map((sc) => (
                                                <div
                                                    key={sc.action}
                                                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                                >
                                                    <div className="space-y-0.5">
                                                        <div className="text-sm font-medium text-primary">
                                                            {sc.action}
                                                        </div>
                                                        <div className="text-sm text-secondary">{sc.note}</div>
                                                    </div>
                                                    <Kbd keys={sc.keys} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {block.codeBlock && (
                                        <CodeBlock
                                            title={block.codeBlock.title}
                                            language={block.codeBlock.language}
                                            code={block.codeBlock.code}
                                            hasCopyButton
                                        />
                                    )}

                                    {block.screenshot && (
                                        <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => setLightboxImage(block.screenshot!)}
                                                className="block w-full cursor-zoom-in overflow-hidden bg-muted focus:outline-none"
                                            >
                                                <img
                                                    src={block.screenshot.src}
                                                    alt={block.screenshot.alt}
                                                    className="w-full h-auto object-cover transition-transform duration-200 hover:scale-[1.01]"
                                                    loading="lazy"
                                                />
                                            </button>
                                            <figcaption className="border-t border-border px-4 py-2.5 text-sm text-secondary">
                                                {block.screenshot.caption}
                                            </figcaption>
                                        </figure>
                                    )}
                                </section>
                            ))}
                        </div>

                        {/* Section Prev / Next Pagination */}
                        <Divider className="my-10" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {prevSection ? (
                                <ClickableCard
                                    label={prevSection.title}
                                    padding={4}
                                    onClick={() => selectSection(prevSection.id)}
                                >
                                    <div className="flex items-center gap-2 text-xs text-secondary">
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                        <span>{lang === 'zh-CN' ? '上一章' : 'Previous'}</span>
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-primary">
                                        {prevSection.title}
                                    </div>
                                </ClickableCard>
                            ) : (
                                <div />
                            )}

                            {nextSection && (
                                <ClickableCard
                                    label={nextSection.title}
                                    padding={4}
                                    onClick={() => selectSection(nextSection.id)}
                                    className="text-right"
                                >
                                    <div className="flex items-center justify-end gap-2 text-xs text-secondary">
                                        <span>{lang === 'zh-CN' ? '下一章' : 'Next'}</span>
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-primary">
                                        {nextSection.title}
                                    </div>
                                </ClickableCard>
                            )}
                        </div>
                    </main>

                    {/* Right On-This-Page Outline */}
                    <aside className="hidden w-52 shrink-0 xl:block">
                        <div className="sticky top-20 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                                {lang === 'zh-CN' ? '本页目录' : 'On this page'}
                            </p>
                            <nav className="space-y-1.5 border-l border-border pl-3">
                                {activeSection.blocks.map((block) => (
                                    <a
                                        key={block.id}
                                        href={`#${block.id}`}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            document.getElementById(block.id)?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        className="block text-sm text-secondary hover:text-primary no-underline leading-snug"
                                    >
                                        {block.heading}
                                    </a>
                                ))}
                            </nav>
                        </div>
                    </aside>
                </div>

                {/* Footer */}
                <footer className="border-t border-border bg-surface py-6">
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-secondary sm:px-6">
                        <span>
                            CuminLang — AGPL-3.0 · Built with Astryx UI
                        </span>
                        <span>
                            {lang === 'zh-CN'
                                ? '基于 solidSpoon/DashPlayer 2cf57c69 派生，自 0bd93e61 起独立演进'
                                : 'Forked from solidSpoon/DashPlayer@2cf57c69, independent since 0bd93e61'}
                        </span>
                    </div>
                </footer>

                {/* Lightbox Modal for Screenshots */}
                {lightboxImage && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                        onClick={() => setLightboxImage(null)}
                    >
                        <div
                            className="relative max-w-6xl w-full overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                                <span className="text-sm font-medium text-primary truncate">
                                    {lightboxImage.caption}
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    isIconOnly
                                    icon={<X className="h-4 w-4" />}
                                    label="Close preview"
                                    onClick={() => setLightboxImage(null)}
                                />
                            </div>
                            <img
                                src={lightboxImage.src}
                                alt={lightboxImage.alt}
                                className="max-h-[82vh] w-full object-contain bg-body"
                            />
                        </div>
                    </div>
                )}
            </div>
        </Theme>
    );
}
