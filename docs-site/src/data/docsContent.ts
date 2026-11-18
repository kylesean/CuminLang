import playerImg from '../../../docs/screenshots/player.png';
import podcastImg from '../../../docs/screenshots/podcast.png';
import practiceImg from '../../../docs/screenshots/practice.png';
import readerImg from '../../../docs/screenshots/reader.png';
import settingsImg from '../../../docs/screenshots/settings.png';

export type DocLang = 'zh-CN' | 'en-US';

export type DocSectionId =
    | 'overview'
    | 'downloads'
    | 'player'
    | 'subtitles'
    | 'practice'
    | 'studio'
    | 'themes'
    | 'faq';

export interface DocHighlight {
    title: string;
    description: string;
    icon: string;
}

export interface DocTableData {
    headers: string[];
    rows: string[][];
}

export interface DocCodeBlock {
    title: string;
    language: string;
    code: string;
}

export interface DocShortcutItem {
    action: string;
    keys: string;
    note: string;
}

export interface DocCallout {
    status: 'info' | 'success' | 'warning';
    title: string;
    description: string;
}

export interface DocBlock {
    id: string;
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
    callout?: DocCallout;
    table?: DocTableData;
    codeBlock?: DocCodeBlock;
    shortcuts?: DocShortcutItem[];
    screenshot?: {
        src: string;
        alt: string;
        caption: string;
    };
}

export interface DocSection {
    id: DocSectionId;
    title: string;
    shortTitle: string;
    subtitle: string;
    icon: string;
    badge?: string;
    highlights?: DocHighlight[];
    blocks: DocBlock[];
}

export interface ThemeShowcaseItem {
    slug: 'dp-matcha' | 'dp-neutral' | 'dp-stone' | 'dp-chocolate' | 'dp-butter' | 'dp-gothic' | 'dp-y2k';
    name: string;
    darkOnly?: boolean;
    summaryZh: string;
    summaryEn: string;
    swatch: string;
}

export const THEME_SHOWCASE_LIST: ThemeShowcaseItem[] = [
    {
        slug: 'dp-matcha',
        name: 'Matcha',
        summaryZh: '自然抹茶 · 温和低眩光绿调，适合长时间精读',
        summaryEn: 'Matcha · Calm organic green palette built for extended reading',
        swatch: '#4a6741',
    },
    {
        slug: 'dp-neutral',
        name: 'Neutral',
        summaryZh: '中性暖灰 · 克制安静，聚焦画面与字幕正文',
        summaryEn: 'Neutral · Restrained warm grays keeping content in focus',
        swatch: '#525252',
    },
    {
        slug: 'dp-stone',
        name: 'Stone',
        summaryZh: '暖石板岩 · 沉稳质感，高对比排版轮廓',
        summaryEn: 'Stone · Grounded warm slate with crisp typographic hierarchy',
        swatch: '#57534e',
    },
    {
        slug: 'dp-chocolate',
        name: 'Chocolate',
        summaryZh: '可可棕褐 · 浓郁书卷氛围，适合夜间学习',
        summaryEn: 'Chocolate · Rich warm cocoa tones with editorial warmth',
        swatch: '#6b4423',
    },
    {
        slug: 'dp-butter',
        name: 'Butter',
        summaryZh: '奶油柔黄 · 轻盈明快搭配友好蓝强调色',
        summaryEn: 'Butter · Soft creamy yellow with friendly blue accents',
        swatch: '#2563eb',
    },
    {
        slug: 'dp-gothic',
        name: 'Gothic',
        darkOnly: true,
        summaryZh: '暗夜深蓝 · 专属深色模式，衬线展示字体',
        summaryEn: 'Gothic · Dark-only deep blue-grays with editorial serif contrast',
        swatch: '#334155',
    },
    {
        slug: 'dp-y2k',
        name: 'Y2K',
        summaryZh: '千禧撞色 · 鲜活高饱和视觉与复古几何感',
        summaryEn: 'Y2K · Playful retro palette with crisp geometric contrast',
        swatch: '#db2777',
    },
];

const ZH_SECTIONS: DocSection[] = [
    {
        id: 'overview',
        title: '产品概览',
        shortTitle: '产品概览',
        subtitle: '面向沉浸式语言学习的现代音视频播放器与 AI 原生桌面学习工作台。',
        icon: 'Compass',
        badge: 'v1.0.0',
        highlights: [
            {
                title: '本地 + YouTube 一站入库',
                description: '内置 FFmpeg/FFprobe 解码播放与 yt-dlp 导入队列，本地媒体与在线长视频统一管理。',
                icon: 'MonitorPlay',
            },
            {
                title: '三层非破坏式字幕体系',
                description: 'L3 人工编辑 > L2 声学精修 > L1 原始字幕分层隔离，学习笔记与收藏跨轨道无感迁移。',
                icon: 'Captions',
            },
            {
                title: '跟读精练与书卷精读',
                description: '三合一跟读精练台、词典即时查词、流式 AI 精读搭档与语境工坊形成完整学习闭环。',
                icon: 'BookOpenText',
            },
            {
                title: '离线优先与多主题系统',
                description: '支持 whisper.cpp / sherpa-onnx / llama.cpp 全离线推理，内置 7 套 Astryx 主题家族。',
                icon: 'Cpu',
            },
        ],
        blocks: [
            {
                id: 'overview-philosophy',
                heading: '核心定位：把字幕当作一等学习底座',
                paragraphs: [
                    '在常规播放器里，字幕只是视频旁路挂载的一次性展示文本。而在精听和精读场景中，平台自动字幕常存在时间轴重叠、半句腰斩、舞台噪音标签混入等问题；若一刀切重识别，又可能丢失原作者精准的专有名词与标点。',
                    'CuminLang 从底层重构了媒体播放、字幕清洗、声学对账与复习沉淀的全链路：让本地声学模型负责词级精确时间戳与停顿边界，让参考文本与用户本人负责拼写与语义表达，同时确保一切增强与改写永不破坏原始轨道与已积累的学习记录。',
                ],
                screenshot: {
                    src: playerImg,
                    alt: 'CuminLang 主播放器与侧栏逐句讲稿界面',
                    caption: '主播放工作台：视频画面、双语主字幕、底栏精听控制与可停靠侧栏逐句讲稿（Matcha 浅色主题）',
                },
            },
            {
                id: 'overview-architecture',
                heading: '桌面原生架构与技术栈',
                table: {
                    headers: ['层级', '核心技术选型', '主要职责'],
                    rows: [
                        ['桌面运行时', 'Electron 45 + Chromium + Node.js', '跨平台窗口管理、系统托盘/快捷键、本地进程调度与安全沙盒隔离'],
                        ['前端工作台', 'React 19 + TypeScript + Vite 8 + Tailwind CSS 4', '播放器、精读文稿、跟读精练台、语境工坊与设置中心'],
                        ['设计系统', 'Astryx UI (@astryxdesign/core) + 7 套主题包', '统一语义化色彩/字号 token、深浅色与无障碍交互控件'],
                        ['本地持久化', 'SQLite (better-sqlite3) + Drizzle ORM', '媒体库、观看历史、生词本、语境卡片、跟读记录与任务状态'],
                        ['本地 AI / 媒体', 'FFmpeg、yt-dlp、whisper.cpp、sherpa-onnx、llama.cpp', '视频解码切片、音频提取、GPU/CPU 离线识别、说话人分轨与本地对话'],
                        ['云端 AI 接入', 'Vercel AI SDK (ai / @ai-sdk/*)', '统一接入 DeepSeek、OpenAI、Anthropic、Gemini 与兼容接口'],
                    ],
                },
            },
        ],
    },
    {
        id: 'downloads',
        title: '下载与安装',
        shortTitle: '下载与安装',
        subtitle: '覆盖 macOS Apple Silicon、Windows x64/ARM64 与主流 Linux 发行版（含 Arch Linux / Omarchy）。',
        icon: 'Download',
        badge: '多平台正式版',
        blocks: [
            {
                id: 'downloads-matrix',
                heading: '支持平台与安装包对照',
                paragraphs: [
                    '前往 GitHub Releases 页面即可获取 v1.0.0 及后续版本的正式构建产物。内置应用更新检查（CheckUpdate）会在稳定版发布时提示升级。',
                ],
                table: {
                    headers: ['操作系统', 'CPU 架构', '安装包格式', '离线识别与加速说明'],
                    rows: [
                        ['macOS', 'Apple Silicon (arm64)', '.dmg', '内置 Metal 加速 whisper.cpp 与 sherpa-onnx；暂不提供 Intel x64 构建'],
                        ['Windows', 'x64', '.msi / -Setup.exe', '支持 Vulkan GPU 加速 whisper.cpp 与 sherpa-onnx'],
                        ['Windows', 'arm64', '-Setup.exe', '原生 ARM64 构建；离线字幕生成由 sherpa-onnx 引擎提供'],
                        ['Ubuntu / Debian', 'x64 (amd64)', '.deb', '包含桌面入口与图标配置，支持 Vulkan 核显/独显推理'],
                        ['Fedora / RHEL', 'x64 (x86_64)', '.rpm', '标准 RPM 安装包'],
                        ['通用 Linux', 'x64', '.AppImage', '免安装单文件可执行镜像'],
                        ['Arch Linux / Omarchy', 'x86_64', '.pkg.tar.zst', '配置 StartupWMClass=cuminlang 与全尺寸 hicolor 图标'],
                    ],
                },
                callout: {
                    status: 'info',
                    title: 'Arch Linux / Omarchy 一键安装命令',
                    description: '从 Release 下载 .pkg.tar.zst 包后，在终端执行 pacman -U 即可完成安装与桌面菜单注册。',
                },
                codeBlock: {
                    title: 'Arch Linux / Omarchy 安装示例',
                    language: 'bash',
                    code: 'sudo pacman -U cuminlang-1.0.0-1-x86_64.pkg.tar.zst',
                },
            },
            {
                id: 'downloads-source',
                heading: '从源码构建与开发启动',
                paragraphs: [
                    '若需在本地源码调试或自定义打包，需准备 Node.js 22.22+（或 24.15+）与 pnpm：',
                ],
                codeBlock: {
                    title: '本地开发与验证常用命令',
                    language: 'bash',
                    code: `# 1. 安装依赖
pnpm install

# 2. 下载各平台预编译运行时（FFmpeg、sherpa-onnx、llama.cpp、whisper.cpp）
pnpm run download

# 3. 启动桌面开发环境
pnpm start

# 4. 运行质量门禁与当前平台打包
pnpm run lint
pnpm run typecheck
pnpm run test:run
pnpm run make`,
                },
            },
        ],
    },
    {
        id: 'player',
        title: '沉浸式播放与播客模式',
        shortTitle: '播放与播客',
        subtitle: '围绕外语精听重新设计的播放器：单句闭环、可停靠讲稿流、YouTube 导入与盲听播客。',
        icon: 'Play',
        blocks: [
            {
                id: 'player-library',
                heading: '媒体库与 YouTube 导入工作流',
                bullets: [
                    '本地媒体库自动扫描与历史记录：支持常见视频/音频容器，记录精确观看进度、已练句数与字幕来源标签。',
                    '内置 YouTube 链接导入：集成 yt-dlp 管理、按需二进制安装、后台任务队列与取消恢复，支持选择画质与字幕轨，导入完成后直接入库播放与精读。',
                    '字幕显示四态切换：支持「双语」「仅原文」「仅译文」「隐藏字幕」一键切换，满足盲听测试与双语对照需求。',
                ],
            },
            {
                id: 'player-sidebar',
                heading: '可停靠逐句讲稿流与播客模式',
                paragraphs: [
                    '侧栏逐句讲稿支持在外观设置中配置停靠在左侧（精读偏好）或右侧（默认），并提供小/中/大三档正文字号以及全文关键词检索、生词/收藏过滤。',
                    '进入播客沉浸模式后，播放器转为全屏大字句级滚动视图，并可开启「盲听」隐藏文字，搭配桌面悬浮字幕窗口满足碎片化跟听。',
                ],
                screenshot: {
                    src: podcastImg,
                    alt: 'CuminLang 播客沉浸模式界面',
                    caption: '播客沉浸模式：居中句级焦点、倍速与循环控制，右上角可切换盲听或切回字幕文稿',
                },
            },
            {
                id: 'player-controls',
                heading: '精听控制与播放器热键',
                paragraphs: [
                    '所有核心播放动作均支持在设置中心自定义快捷键组合，并自动检测按键冲突与保留快捷键冲突。',
                ],
                shortcuts: [
                    { action: '播放 / 暂停', keys: 'space', note: '支持输入态热键自动隔离，编辑字幕或笔记时不误触' },
                    { action: '上一句 / 下一句', keys: 'left', note: '按字幕句级边界精确跳转并支持单句自动停顿' },
                    { action: '单句重播 / 单句循环', keys: 'r', note: '复读当前句或锁定当前句循环精听' },
                    { action: '微调当前句起止时间', keys: 'alt+left', note: '支持前/后微调开始与结束边界及一键复位' },
                ],
            },
        ],
    },
    {
        id: 'subtitles',
        title: '智能字幕引擎与离线识别',
        shortTitle: '智能字幕引擎',
        subtitle: '真假字幕诊断、L3 > L2 > L1 三层非破坏轨道、离线 ASR 声学融合与原地行内精校。',
        icon: 'AudioLines',
        badge: '核心引擎',
        blocks: [
            {
                id: 'subtitles-diagnosis',
                heading: '1. 真假字幕内容级诊断',
                paragraphs: [
                    'CuminLang 不只依赖文件名（如 .en.srt 与 .en-orig.srt）判断字幕质量，而是对字幕正文做多维体检：',
                ],
                bullets: [
                    '识别伪装自动字幕：捕获相邻句大面积时间轴重叠（滚屏效应）与高比例 [Music]、[Applause]、>> 等舞台非人声标记。',
                    '识别残缺或异常空洞轨：捕获持续时间超长却几乎没有有效单词的时间轴空洞，揪出大段漏翻或漏字轨道。',
                    '克制打扰原则：确认是高质量人工字幕（author）或已精修/已编辑轨道时，绝不弹出多余的重识提示条。',
                ],
            },
            {
                id: 'subtitles-layers',
                heading: '2. 三层非破坏式轨道架构（L3 > L2 > L1）',
                paragraphs: [
                    '在媒体同目录下以清晰后缀隔离不同权威等级的字幕文件，任何增强与改写均不破坏原始轨道，且可在面板一键对比切换：',
                ],
                table: {
                    headers: ['轨道层级', '文件名约定', '权威等级与写入规则'],
                    rows: [
                        ['L1 原始外部轨', '*.en.srt / 外挂字幕', '仅作素材输入与兜底回退，系统永远只读不写'],
                        ['L2 本地声学精修轨', '<视频名>.local.srt', '本地 ASR 识别或音文双向对账生成；落盘后加载严格 1:1 直读'],
                        ['L3 人工编辑轨', '<视频名>.edited.srt', '用户在文稿区亲手修改后的成果；全系统最高权威，后台任务永远绕行'],
                    ],
                },
            },
            {
                id: 'subtitles-asr',
                heading: '3. 离线 ASR 引擎与音文双向对账',
                bullets: [
                    '双离线引擎覆盖：Linux/Windows x64 与 macOS Apple Silicon 默认搭载 GPU 加速的 whisper.cpp（Vulkan / Metal）；全平台同时配备 sherpa-onnx（含 Windows ARM64）并支持本地声纹说话人识别分轨。',
                    '全链路洁净清洗与意群 DP 分段：剥离 [Music] 等噪音同时保留正常口语补充括号；在真实停顿（>= 1.0s）处禁止误合并，避免句末标点溢流到下一句或在虚词处生硬折断。',
                    '各取所长的音文对账融合：外挂字幕完整时采用「保文校时」，保留原作者拼写、专有名词与标点，用声学时间轴消除滞后；外挂字幕残缺时采用「声学救稿 + 专名抢救」，以声学识别为主干并在时间窗内抢救罕见专有名词。',
                    '后台静默热切换：在开关开启且模型就绪时自动低干扰排队精修，完成后原地无缝刷新轨道，不打断播放也不重置播放进度。',
                ],
            },
            {
                id: 'subtitles-inline-edit',
                heading: '4. 右侧文稿原地精校与学习资产迁移',
                paragraphs: [
                    '在逐句模式与连贯讲稿模式下，双击英文句即可进入原地行内编辑状态，内置当前句重播按钮，支持按光标位置根据音节权重拆分成两句、一键并入下一句，以及多步 Cmd/Ctrl+Z 撤销。',
                    '当字幕从 L1 升级到 L2 或因人工精校更新 L3 导致文件哈希（fileHash）变化时，系统会在同一次 SQLite 事务中基于「文本词重合 + 时间区间重合」自动锚定新旧句子序号，将收藏金句、AI 精析笔记与跟读打分记录安全迁移至新轨道，未改动句子继续 100% 复用译文缓存。',
                ],
            },
        ],
    },
    {
        id: 'practice',
        title: '跟读精练台与精读文稿',
        shortTitle: '跟读与精读',
        subtitle: '将「看懂」转化为「听清、能说、会用」的双核心学习工作台。',
        icon: 'Mic',
        blocks: [
            {
                id: 'practice-dock',
                heading: '三合一跟读精练台（Practice Dock）',
                paragraphs: [
                    '播放页底部可随时展开跟读精练台，聚焦当前单句完成高频刻意练习：',
                ],
                bullets: [
                    '跟读听写模式：支持盲听逐词听写、错误拼写对比与即时提示。',
                    '录音对比模式：录制自己的跟读发音，支持原音与自己录音 A/B 快速对比（可配合播完自动开麦）。',
                    '节拍流模式：按意群节奏提示跟读，训练连读、重音与口语流畅度。',
                    '全键盘盲操支持：R 播放原句、S 切换 0.75x 慢速、Space 对讲点按/长按录音、V 切换 A/B 对比、P 播放我的录音、F 专注模式。',
                ],
                screenshot: {
                    src: practiceImg,
                    alt: 'CuminLang 跟读听写与录音对比精练台',
                    caption: '跟读精练台：集成跟读听写、录音对比与节拍流三大模式，底部提供完整盲操按键指引',
                },
            },
            {
                id: 'practice-reader',
                heading: '书卷式精读文稿与 AI 精读搭档',
                paragraphs: [
                    '精读文稿模块将长视频讲稿排布为舒适的书卷阅读版面，配合词法标注与流式 AI 助手逐层吃透内容：',
                ],
                bullets: [
                    '词频与生词难度标记：顶部自动聚合本篇高频生词芯片与出现次数，正文按学习状态渲染下划线标记。',
                    '内置与外部词典即时查词：点击任意单词即弹出浮层释义（含音标、发音、柯林斯星级与个人学习记录），支持导入外部词典包与英英释义包。',
                    'AI 精读搭档（Study Copilot）：侧栏常驻精读搭档，内置「点破言外之意」「讲透核心表达」「情景造句实战」「查前后剧情」等指令模板，流式解析当前语境。',
                    '双语讲义导出：支持将整理后的双语讲稿、生词与笔记导出为结构化 Markdown 讲义。',
                ],
                screenshot: {
                    src: readerImg,
                    alt: 'CuminLang 精读文稿与内置词典、精读搭档界面',
                    caption: '精读文稿：高频生词芯片、行内点击查词弹窗与右侧 AI 精读搭档工作流',
                },
            },
        ],
    },
    {
        id: 'studio',
        title: '语境工坊、本地 AI 与手机伴侣',
        shortTitle: '工坊与 AI 生态',
        subtitle: '保存带原声音频的真实语境卡片，自由搭配本地离线模型或云端大模型，并扩展至手机端复习。',
        icon: 'Layers',
        blocks: [
            {
                id: 'studio-cards',
                heading: '语境工坊与间隔复习',
                bullets: [
                    '原声语境采集：在播放或精读时一键收入重点句子，完整保留视频原声片段、起止时间轴、所属视频上下文与个人笔记。',
                    '复习工作流：进入复习页面按记忆节律回听原声例句、核对语义与表达用法，形成长期语言记忆沉淀。',
                ],
            },
            {
                id: 'studio-ai',
                heading: '本地 llama.cpp 与云端 AI Provider',
                paragraphs: [
                    'CuminLang 通过统一的 AI 任务路由层，支持本地离线推理与云端 API 按需切换：',
                ],
                table: {
                    headers: ['能力分类', '支持方案', '适用场景'],
                    rows: [
                        ['本地大语言模型', '内置 llama.cpp (llama-server，支持 Vulkan / Metal / CPU)', '完全离线语境问答、讲稿解析与零 API 成本学习'],
                        ['本地向量索引', 'EmbeddingGemma 本地嵌入模型 + 向量检索', '长视频讲稿语义搜索与精读搭档前后文召回'],
                        ['云端预设 Provider', 'DeepSeek、OpenAI (Responses API)、Anthropic、Google Gemini', '高精度字幕翻译、整句深度精析与多轮对话'],
                        ['自定义兼容接口', '任意 OpenAI Compatible HTTPS 或本机/局域网 HTTP 端点', '接入 Ollama、LM Studio、vLLM 或企业私有网关'],
                    ],
                },
            },
            {
                id: 'studio-mobile',
                heading: '局域网手机伴侣（Mobile Access）',
                paragraphs: [
                    '在「设置中心 → 手机访问」开启内置局域网 HTTP 服务并配置访问口令后，同局域网内的手机或平板浏览器扫码即可访问媒体库、播放进度与生词复习界面，与桌面 SQLite 实时同步。',
                ],
            },
        ],
    },
    {
        id: 'themes',
        title: '外观主题、代理与系统设置',
        shortTitle: '外观与设置',
        subtitle: '基于 Astryx 设计系统的 7 套可切换主题家族，保持严谨的视觉尺度与自定义自由度。',
        icon: 'Palette',
        blocks: [
            {
                id: 'themes-interactive',
                heading: '7 套主题家族（点击下方卡片可直接在本文档页预览效果）',
                paragraphs: [
                    'CuminLang 严格遵循「主题只改风格（配色、字体族、圆角、阴影），不改字号、间距与控件高度」的视觉工程约束。7 套主题均已完成全部弹层、表格、播放器与阅读器的语义 token 映射。',
                ],
                screenshot: {
                    src: settingsImg,
                    alt: 'CuminLang 设置中心外观与主题面板',
                    caption: '设置中心外观面板：7 套主题家族、色彩模式（跟随系统/深色/浅色）、界面字号与文稿停靠方位调节',
                },
            },
            {
                id: 'themes-system',
                heading: '网络代理、存储与数据安全',
                bullets: [
                    '网络代理设置：支持「跟随系统」「直连」「自定义 HTTP / SOCKS5 代理」，统一作用于 yt-dlp 导入、模型包下载与云端 AI 请求。',
                    '存储管理与可视化：查看媒体库、字幕缓存、离线模型与词典占用的磁盘明细，支持切换存储根目录与安全清理缓存。',
                    '渲染层安全边界：生产构建强制注入桌面 Content Security Policy（CSP），对外导航白名单隔离，敏感凭据日志自动脱敏。',
                ],
            },
        ],
    },
    {
        id: 'faq',
        title: '常见问题与开源致谢',
        shortTitle: 'FAQ 与开源',
        subtitle: '关于离线模型、字幕机制、版权与项目演进历史的完整说明。',
        icon: 'HelpCircle',
        blocks: [
            {
                id: 'faq-items',
                heading: '高频问题解答',
                bullets: [
                    'Q：不下载离线语音或语言模型，可以直接用吗？—— 可以。哪怕不下载任何模型，外挂字幕与 YouTube 导入字幕依然会经过前置清洗与 DP 意群分段引擎秒开播放，所有查词、跟读、录音对比与语境工坊功能均可立即使用。',
                    'Q：为什么有时会出现「切到本地识别」提示条，有时不会？—— 当内容级诊断发现外部字幕存在高重叠滚屏、舞台噪音标记或明显时间轴空洞时，才会克制提示升级；若确认是干净的人工字幕或 L3 人工编辑轨，绝不打扰。',
                    'Q：人工改错了句子怎么回退？—— 编辑器内支持多步 Cmd/Ctrl+Z 撤销；落盘后仍可在控制面板一键切回 L1 原始轨或 L2 本地识别轨进行对比与恢复。',
                    'Q：macOS Intel（x64）为什么没有发布安装包？—— 自 v1.0.0 起 macOS 专注支持 Apple Silicon（arm64）与 Metal 加速栈，不再维护 macOS x64 构建。',
                ],
            },
            {
                id: 'faq-lineage',
                heading: '开源致谢与演进边界',
                paragraphs: [
                    'CuminLang 基于上游开源项目 solidSpoon/DashPlayer 提交 2cf57c694b0015b51730c0c03abdfbc141feaf8b（2026-11-07）创建派生，并从提交 0bd93e61bcf70fbe94b2ae1a9ce28d25f3224e5e（2026-11-07）起独立演进、重构与持续维护。',
                    '感谢原作者对桌面音视频学习工作流早期形态的探索。本项目采用 GNU Affero General Public License v3.0 (AGPL-3.0) 开源协议发布。',
                ],
            },
        ],
    },
];

const EN_SECTIONS: DocSection[] = [
    {
        id: 'overview',
        title: 'Overview',
        shortTitle: 'Overview',
        subtitle: 'An immersive desktop media player and AI-native language learning workbench.',
        icon: 'Compass',
        badge: 'v1.0.0',
        highlights: [
            {
                title: 'Local Media + YouTube Queue',
                description: 'Built-in FFmpeg/FFprobe playback paired with a yt-dlp import pipeline integrated directly into your library.',
                icon: 'MonitorPlay',
            },
            {
                title: 'Non-Destructive 3-Layer Subtitles',
                description: 'L3 (edited) > L2 (local ASR) > L1 (original) tracks stay isolated while bookmarks, notes, and drills migrate seamlessly.',
                icon: 'Captions',
            },
            {
                title: 'Practice Dock & Script Reader',
                description: 'Shadowing/dictation, A/B voice comparison, instant dictionary lookups, and a streaming AI Study Copilot.',
                icon: 'BookOpenText',
            },
            {
                title: 'Offline-First & 7 Astryx Themes',
                description: 'Run whisper.cpp, sherpa-onnx, and llama.cpp locally with zero cloud dependency across 7 curated themes.',
                icon: 'Cpu',
            },
        ],
        blocks: [
            {
                id: 'overview-philosophy',
                heading: 'Design Philosophy: Subtitles as a First-Class Learning Foundation',
                paragraphs: [
                    'In ordinary media players, subtitles are treated as disposable sidecar text. Serious language learners run into overlapping auto-captions, mid-clause line breaks, and [music] noise tags — yet blindly replacing every subtitle with speech recognition risks losing accurate proper nouns and punctuation from human authors.',
                    'CuminLang rebuilds the media, subtitle, and study pipeline from the ground up: local acoustic models provide word-level timing and real pause boundaries, reference transcripts and your edits preserve spelling and nuance, and non-destructive track layering guarantees your study history never disappears when tracks upgrade.',
                ],
                screenshot: {
                    src: playerImg,
                    alt: 'CuminLang main player and side transcript panel',
                    caption: 'Main player workspace: video canvas, bilingual subtitle bar, transport controls, and dockable transcript stream (Matcha Light)',
                },
            },
            {
                id: 'overview-architecture',
                heading: 'Desktop Architecture & Stack',
                table: {
                    headers: ['Layer', 'Technology', 'Responsibility'],
                    rows: [
                        ['Desktop Shell', 'Electron 45 + Chromium + Node.js', 'Window lifecycle, global shortcuts, native process management, strict CSP isolation'],
                        ['Frontend Workbench', 'React 19 + TypeScript + Vite 8 + Tailwind CSS 4', 'Player, Script Reader, Practice Dock, Context Studio, and Settings'],
                        ['Design System', 'Astryx UI (@astryxdesign/core) + 7 Themes', 'Semantic design tokens, light/dark parity, and accessible controls'],
                        ['Local Database', 'SQLite (better-sqlite3) + Drizzle ORM', 'Media library, watch history, vocabulary states, context cards, and task queue'],
                        ['Local AI & Media', 'FFmpeg, yt-dlp, whisper.cpp, sherpa-onnx, llama.cpp', 'Decoding, audio extraction, GPU/CPU ASR, speaker diarization, local LLM'],
                        ['Cloud AI SDK', 'Vercel AI SDK (ai / @ai-sdk/*)', 'Unified provider layer for DeepSeek, OpenAI, Anthropic, Gemini, and custom endpoints'],
                    ],
                },
            },
        ],
    },
    {
        id: 'downloads',
        title: 'Downloads & Installation',
        shortTitle: 'Downloads',
        subtitle: 'Official v1.0.0 builds for macOS Apple Silicon, Windows x64/ARM64, and Linux (including Arch / Omarchy).',
        icon: 'Download',
        badge: 'Multi-Platform',
        blocks: [
            {
                id: 'downloads-matrix',
                heading: 'Supported Platforms & Installers',
                paragraphs: [
                    'Download official installers from GitHub Releases. Built-in update checks (CheckUpdate) notify you when new stable releases are published.',
                ],
                table: {
                    headers: ['OS', 'Architecture', 'Format', 'Offline ASR & Acceleration Notes'],
                    rows: [
                        ['macOS', 'Apple Silicon (arm64)', '.dmg', 'Metal-accelerated whisper.cpp + sherpa-onnx (Intel x64 is not built)'],
                        ['Windows', 'x64', '.msi / -Setup.exe', 'Vulkan GPU-accelerated whisper.cpp + sherpa-onnx'],
                        ['Windows', 'arm64', '-Setup.exe', 'Native ARM64 build; offline ASR powered by sherpa-onnx'],
                        ['Ubuntu / Debian', 'x64 (amd64)', '.deb', 'Includes desktop entry and icons; Vulkan GPU acceleration'],
                        ['Fedora / RHEL', 'x64 (x86_64)', '.rpm', 'Standard RPM package'],
                        ['Universal Linux', 'x64', '.AppImage', 'Portable single-file executable'],
                        ['Arch Linux / Omarchy', 'x86_64', '.pkg.tar.zst', 'Ships StartupWMClass=cuminlang and full hicolor icon set'],
                    ],
                },
                callout: {
                    status: 'info',
                    title: 'Install on Arch Linux / Omarchy',
                    description: 'Download the .pkg.tar.zst package from GitHub Releases and install directly with pacman -U.',
                },
                codeBlock: {
                    title: 'Arch Linux / Omarchy installation',
                    language: 'bash',
                    code: 'sudo pacman -U cuminlang-1.0.0-1-x86_64.pkg.tar.zst',
                },
            },
            {
                id: 'downloads-source',
                heading: 'Building from Source',
                paragraphs: [
                    'Requires Node.js 22.22+ (or 24.15+) and pnpm:',
                ],
                codeBlock: {
                    title: 'Development & verification commands',
                    language: 'bash',
                    code: `# 1. Install dependencies
pnpm install

# 2. Fetch prebuilt native runtimes (FFmpeg, sherpa-onnx, llama.cpp, whisper.cpp)
pnpm run download

# 3. Launch desktop dev environment
pnpm start

# 4. Run quality gates & package for the current OS
pnpm run lint
pnpm run typecheck
pnpm run test:run
pnpm run make`,
                },
            },
        ],
    },
    {
        id: 'player',
        title: 'Player & Podcast Mode',
        shortTitle: 'Player & Podcast',
        subtitle: 'Sentence-accurate playback, dockable transcript flow, YouTube imports, and focused Podcast mode.',
        icon: 'Play',
        blocks: [
            {
                id: 'player-library',
                heading: 'Media Library & YouTube Import Queue',
                bullets: [
                    'Unified local media browser and watch history tracking playback position, practiced sentences, and subtitle source badges.',
                    'Built-in YouTube link import queue powered by yt-dlp with managed binary installation, cancellation, and automatic library ingestion.',
                    'Four subtitle display states: Bilingual, Original Only, Translation Only, and Hidden.',
                ],
            },
            {
                id: 'player-sidebar',
                heading: 'Dockable Side Transcript & Podcast Mode',
                paragraphs: [
                    'Dock the transcript stream on the left (reading-focused) or right (default), choose between three text scales, search across all lines, or filter by starred/vocabulary items.',
                    'Switch into full-width Podcast mode for focused listening or enable Blind Listening to test comprehension before revealing lines.',
                ],
                screenshot: {
                    src: podcastImg,
                    alt: 'CuminLang Podcast listening mode',
                    caption: 'Podcast mode: focused sentence view with rate, loop, blind-listening toggle, and transcript drawer access',
                },
            },
            {
                id: 'player-controls',
                heading: 'Transport Controls & Shortcuts',
                paragraphs: [
                    'Shortcuts are fully customizable in Settings with automatic reserved-key and duplicate-binding conflict detection.',
                ],
                shortcuts: [
                    { action: 'Play / Pause', keys: 'space', note: 'Automatically isolated while typing in inline editors or notes' },
                    { action: 'Previous / Next Sentence', keys: 'left', note: 'Seek cleanly by subtitle sentence boundary' },
                    { action: 'Repeat / Loop Sentence', keys: 'r', note: 'Replay current line or lock single-sentence loop' },
                    { action: 'Fine-tune Boundaries', keys: 'alt+left', note: 'Nudge sentence start/end timestamps or reset' },
                ],
            },
        ],
    },
    {
        id: 'subtitles',
        title: 'Subtitle Engine & Local ASR',
        shortTitle: 'Subtitle Engine',
        subtitle: 'Content-level diagnostics, L3 > L2 > L1 non-destructive tracks, offline ASR reconciliation, and inline editing.',
        icon: 'AudioLines',
        badge: 'Core Engine',
        blocks: [
            {
                id: 'subtitles-diagnosis',
                heading: '1. Content-Level Subtitle Diagnostics',
                paragraphs: [
                    'Rather than trusting filenames alone, CuminLang inspects subtitle bodies for overlapping rolling auto-captions, high stage-noise ratios ([Music], >>), and unnatural timeline gaps.',
                    'Clean human-authored subtitles and user-edited tracks never receive noisy re-transcription banners.',
                ],
            },
            {
                id: 'subtitles-layers',
                heading: '2. Three-Layer Non-Destructive Architecture (L3 > L2 > L1)',
                table: {
                    headers: ['Layer', 'Filename Convention', 'Authority & Behavior'],
                    rows: [
                        ['L1 Original Track', '*.en.srt / sidecar file', 'Read-only reference & fallback; never modified by CuminLang'],
                        ['L2 Local ASR Track', '<video>.local.srt', 'Generated by local ASR or audio-text reconciliation; loaded 1:1 verbatim'],
                        ['L3 Edited Track', '<video>.edited.srt', 'User-refined transcript; highest authority, skipped by background upgrades'],
                    ],
                },
            },
            {
                id: 'subtitles-asr',
                heading: '3. Offline ASR & Bidirectional Audio-Text Reconciliation',
                bullets: [
                    'Dual offline engines: whisper.cpp with Vulkan (Linux/Windows x64) or Metal (macOS Apple Silicon), plus cross-platform sherpa-onnx (including Windows ARM64) and local speaker diarization.',
                    'Pause-aware deduplication and dynamic-programming phrase segmentation keep clauses natural without stranding punctuation or splitting function words.',
                    'Bidirectional reconciliation: keeps author spelling and proper nouns while realigning word-level acoustic timestamps, or rescues rare proper nouns when fixing broken auto-captions.',
                    'Silent hot-swap: background upgrades refresh tracks in place without interrupting playback or resetting your timestamp.',
                ],
            },
            {
                id: 'subtitles-inline-edit',
                heading: '4. Inline Editing & Atomic Study Asset Migration',
                paragraphs: [
                    'Double-click any English sentence in the transcript panel to fix typos inline, replay the line, split at the cursor by syllable weight, merge with the next sentence, or undo with Cmd/Ctrl+Z.',
                    'Whenever subtitle tracks upgrade or change hash (fileHash), a single SQLite transaction anchors old and new lines via word + time overlap so favorites, notes, and practice scores migrate intact.',
                ],
            },
        ],
    },
    {
        id: 'practice',
        title: 'Practice Dock & Script Reader',
        shortTitle: 'Practice & Reader',
        subtitle: 'Turn passive comprehension into active speaking, listening, and structured reading retention.',
        icon: 'Mic',
        blocks: [
            {
                id: 'practice-dock',
                heading: 'Three-in-One Practice Dock',
                bullets: [
                    'Shadowing & Dictation: type what you hear with instant word-level feedback.',
                    'Voice Recording A/B Comparison: record your voice and toggle between original audio and your recording.',
                    'Beat / Rhythm Flow: practice stress, linking, and natural cadence sentence by sentence.',
                    'Eyes-free keyboard workflow: R (original), S (0.75x), Space (push-to-talk), V (A/B compare), P (my recording), F (focus mode).',
                ],
                screenshot: {
                    src: practiceImg,
                    alt: 'CuminLang Practice Dock',
                    caption: 'Practice Dock with shadowing, voice comparison, beat mode, and keyboard shortcut hints',
                },
            },
            {
                id: 'practice-reader',
                heading: 'Book-Style Script Reader & Study Copilot',
                bullets: [
                    'Vocabulary frequency chips and inline difficulty highlights across the entire video transcript.',
                    'Instant built-in and imported dictionary popups with phonetics, audio playback, star ratings, and learning state.',
                    'Streaming AI Study Copilot sidebar with built-in prompt templates for nuance, core expressions, example drills, and surrounding context.',
                    'Export bilingual study notes and vocabulary highlights cleanly to Markdown.',
                ],
                screenshot: {
                    src: readerImg,
                    alt: 'CuminLang Script Reader with dictionary popup and Study Copilot',
                    caption: 'Script Reader: vocabulary frequency chips, instant dictionary lookup, and streaming AI Study Copilot',
                },
            },
        ],
    },
    {
        id: 'studio',
        title: 'Context Studio, Local AI & Mobile Companion',
        shortTitle: 'Studio & AI',
        subtitle: 'Capture real-audio context cards, run local or cloud LLMs, and review from mobile browsers on your LAN.',
        icon: 'Layers',
        blocks: [
            {
                id: 'studio-cards',
                heading: 'Context Studio & Spaced Review',
                bullets: [
                    'Save any sentence with its original video audio segment, timestamps, source context, and personal notes.',
                    'Review saved context cards in a dedicated spaced review flow.',
                ],
            },
            {
                id: 'studio-ai',
                heading: 'Local llama.cpp & Cloud AI Providers',
                table: {
                    headers: ['Capability', 'Supported Options', 'Best For'],
                    rows: [
                        ['Local LLM Runtime', 'Bundled llama.cpp (Vulkan / Metal / CPU)', '100% offline study chat & zero API cost'],
                        ['Local Embeddings', 'EmbeddingGemma local vector index', 'Fast semantic search across long transcripts'],
                        ['Cloud Presets', 'DeepSeek, OpenAI (Responses API), Anthropic, Gemini', 'High-accuracy subtitle translation & deep explanations'],
                        ['Custom Endpoints', 'Any OpenAI-compatible HTTPS or local/LAN HTTP server', 'Ollama, LM Studio, vLLM, or private gateways'],
                    ],
                },
            },
            {
                id: 'studio-mobile',
                heading: 'LAN Mobile Companion',
                paragraphs: [
                    'Enable the built-in LAN server in Settings -> Mobile Access to browse your library, watch progress, and review vocabulary from any phone or tablet browser on the same Wi-Fi network.',
                ],
            },
        ],
    },
    {
        id: 'themes',
        title: 'Themes, Proxy & System Settings',
        shortTitle: 'Themes & Settings',
        subtitle: 'Seven curated Astryx theme families with consistent layout geometry, proxy controls, and storage insights.',
        icon: 'Palette',
        blocks: [
            {
                id: 'themes-interactive',
                heading: '7 Theme Families (Click any card below to preview live on this docs site)',
                paragraphs: [
                    'Themes transform colors, font families, border radii, and elevation without ever altering font sizes, line heights, or control dimensions.',
                ],
                screenshot: {
                    src: settingsImg,
                    alt: 'CuminLang Appearance Settings',
                    caption: 'Appearance Settings: 7 theme families, light/dark/system mode, font scaling, and transcript panel dock controls',
                },
            },
            {
                id: 'themes-system',
                heading: 'Proxy, Storage & Security Boundaries',
                bullets: [
                    'Network Proxy: System, Direct, or custom HTTP / SOCKS5 proxy applied uniformly across yt-dlp imports, model downloads, and cloud AI requests.',
                    'Storage Breakdown: Inspect disk usage across media, subtitles, offline models, and dictionaries; relocate library directories or clear caches safely.',
                    'Security Guardrails: Production builds enforce desktop Content Security Policy (CSP), strict external navigation allowlists, and credential redaction in logs.',
                ],
            },
        ],
    },
    {
        id: 'faq',
        title: 'FAQ & Acknowledgments',
        shortTitle: 'FAQ & License',
        subtitle: 'Answers to common questions, open-source lineage, and AGPL-3.0 license details.',
        icon: 'HelpCircle',
        blocks: [
            {
                id: 'faq-items',
                heading: 'Frequently Asked Questions',
                bullets: [
                    'Do I have to download offline speech or LLM models? — No. Even without any downloaded models, external and YouTube subtitles are cleaned, segmented, and ready for playback, dictionary lookups, practice drills, and Context Studio immediately.',
                    'How do I revert an inline subtitle edit? — Use Cmd/Ctrl+Z while editing, or switch back to the read-only L1 original or L2 local track in the subtitle track menu at any time.',
                    'Why is there no macOS Intel (x64) installer? — Starting with v1.0.0, macOS releases target Apple Silicon (arm64) with Metal acceleration exclusively.',
                ],
            },
            {
                id: 'faq-lineage',
                heading: 'Acknowledgments & Lineage',
                paragraphs: [
                    'CuminLang forked from upstream solidSpoon/DashPlayer at commit 2cf57c694b0015b51730c0c03abdfbc141feaf8b (2026-11-07) and has evolved independently starting from commit 0bd93e61bcf70fbe94b2ae1a9ce28d25f3224e5e (2026-11-07).',
                    'Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).',
                ],
            },
        ],
    },
];

export const DOCS_CONTENT: Record<DocLang, DocSection[]> = {
    'zh-CN': ZH_SECTIONS,
    'en-US': EN_SECTIONS,
};
