/** 匹配到的后端错误文案键与插值参数。 */
export interface BackendErrorMatch {
    key: string;
    params?: Record<string, string | number>;
    /** 若存在嵌套错误详情字段，可在外层格式化前先递归翻译。 */
    nestedParam?: string;
}

const MODEL_NAME_KEYS: Readonly<Record<string, string>> = {
    '音素 GOP': 'model.names.phonemeGop',
    '音素 GOP 模型': 'model.names.phonemeGop',
    'yt-dlp 组件': 'model.names.ytDlp',
    'SenseVoice 中英双语语音模型': 'model.names.senseVoice',
    '说话人分割模型': 'model.names.speakerSegmentation',
    '声纹嵌入模型': 'model.names.speakerEmbedding',
    '说话人分离模型': 'model.names.speakerDiarization',
};

const EXACT_MESSAGES: Readonly<Record<string, string>> = {
    '接口地址必须使用 https://，或使用本机/局域网推理服务的 http:// 地址': 'validation.endpointHttpsOrLan',
    '仅支持 HTTPS 外部链接或本机/局域网 HTTP 地址': 'validation.externalUrlHttpsOrLan',
    'videoId 或 fileHash 至少提供一个': 'validation.videoIdOrFileHashRequired',
    '录音时间过短，请多说几个词再结束录音': 'asr.recordingTooShort',
    '没有识别到英文语音。请确认对着麦克风用英语朗读，且麦克风没有被静音。': 'asr.noEnglishSpeech',
    '没有识别到语音。请靠近麦克风、避开环境噪音后重试。': 'asr.noSpeech',
    '没有识别到语音内容': 'asr.noSpeechDetected',
    '未识别到任何语音内容': 'asr.noSpeechDetected',
    '语音识别失败': 'asr.failed',
    'AI 模型未配置：请到「设置 → 服务与资源」填写接口地址、API Key（本地服务可留空）与模型，或点「使用预设」快速填入': 'ai.notConfigured',
    'OpenAI 可用模型列表为空，请先在服务配置中添加或启用模型': 'ai.noAvailableModels',
    '整句学习功能未启用，请先在功能设置中启用': 'ai.sentenceLearningDisabled',
    '模型未在服务配置中添加': 'aiTest.modelNotAdded',
    'API Key 或 API URL 未配置': 'aiTest.missingCredentials',
    '测试成功': 'aiTest.openAiSuccess',
    '返回了空响应': 'aiTest.emptyResponse',
    '腾讯云配置不完整': 'aiTest.tencentIncomplete',
    '腾讯云配置测试成功': 'aiTest.tencentSuccess',
    '腾讯云返回了空响应': 'aiTest.tencentEmptyResponse',
    '整句讲解还没选好云端模型，请先在「可用模型」里选一个': 'settings.sentenceLearningModelRequired',
    '字幕翻译还没选好云端模型，请先在「可用模型」里选一个': 'settings.subtitleTranslationModelRequired',
    '词典查词还没选好云端模型，请先在「可用模型」里选一个': 'settings.dictionaryModelRequired',
    '设置项 learning.activePromptPresetId 不能为空': 'settings.emptyPromptPreset',
    '服务商标识不能为空': 'settings.emptyProviderId',
    '自定义代理模式必须填写代理地址': 'settings.missingProxyUrl',
    '端口需在 1-65535 之间': 'mobileAccess.invalidPort',
    '缩略图请求排队已满，请稍后重试': 'mobileAccess.thumbnailQueueFull',
    '媒体路径不能为空': 'media.emptyPath',
    '缩略图时间必须是有限数字': 'media.invalidThumbnailTime',
    '该文件位于视频库中，已为您删除原文件': 'watchHistory.deletedLibraryFile',
    '当前会话的字幕缓存不存在': 'subtitle.sessionCacheMissing',
    '字幕文件哈希不能为空': 'subtitle.emptyHash',
    'renderer 会话标识不能为空': 'subtitle.emptySessionId',
    '未找到字幕缓存，请重新加载字幕或重新打开视频': 'subtitle.cacheMissing',
    '目标恢复轨不能是人工编辑轨本身': 'subtitle.cannotRestoreFromEdited',
    '缺少视频或源字幕路径，无法保存人工编辑轨': 'subtitle.missingSourceForEdited',
    '未启用字幕翻译服务': 'subtitleTranslation.disabled',
    '腾讯翻译客户端未初始化，请检查密钥配置': 'subtitleTranslation.tencentNotInitialized',
    'OpenAI 字幕翻译风格配置缺失': 'subtitleTranslation.styleConfigMissing',
    '腾讯翻译引擎不经过字幕翻译网关': 'subtitleTranslation.tencentGatewayMismatch',
    '该视频正在生成字幕中，请等待完成后再试': 'subtitleGeneration.inProgress',
    '上传学习片段后未找到片段元数据': 'videoLearning.clipMetaMissing',
    '未启用词典服务': 'dictionary.disabled',
    '词典 AI 模型未配置，请先在设置中完成模型配置': 'dictionary.aiNotConfigured',
    '词典 AI 未返回有效释义': 'dictionary.emptyAiResult',
    '单词不能为空': 'vocabulary.emptyWord',
    '单词过长': 'vocabulary.wordTooLong',
    '句子不能为空': 'vocabulary.emptySentence',
    '词条不存在': 'vocabulary.entryNotFound',
    '该词当前不在复习队列': 'vocabulary.notInReviewQueue',
    '导入失败：未找到第一个工作表': 'vocabulary.importNoWorksheet',
    '模型未返回有效的语境含义': 'wordInsight.emptyResult',
    'SQLite 词典缺少 entries 表': 'importedDict.missingEntriesTable',
    'SQLite 词典的 entries 表需要 word 与 translation 字段': 'importedDict.missingWordTranslationColumns',
    '英英释义包已安装': 'englishDict.alreadyInstalled',
    '英英释义包正在下载': 'englishDict.downloading',
    'WordNet 归档缺少 dict 目录': 'englishDict.missingDictDir',
    '下载失败': 'download.failed',
    'YouTube 导入功能已在设置中关闭，请先在设置页开启': 'youtube.disabled',
    '无法识别的 YouTube 链接，请粘贴完整的视频观看地址（如 https://www.youtube.com/watch?v=xxx）': 'youtube.invalidUrl',
    'Cookies 文件只接受 .txt 格式': 'youtube.invalidCookiesExtension',
    'TTS 文本不能为空': 'tts.emptyText',
    'Sherpa TTS 模型尚未下载，请先到设置中心下载模型': 'tts.sherpaNotDownloaded',
    '备份文件不是合法的 JSON': 'learningData.invalidBackupJson',
    '会话开始时间无效': 'learningData.invalidSessionStart',
    '推荐视频不能为空': 'compass.emptyVideo',
    '原句不能为空': 'recap.emptySourceSentence',
    '复述内容不能为空': 'recap.emptyParaphrase',
    '场景开场白不能为空': 'recap.emptyPrompt',
    '回应内容不能为空': 'recap.emptyResponse',
    '会话键不能为空': 'recap.emptySessionKey',
    '对方台词不能为空': 'recap.emptyPartnerLine',
    'AI 复盘没有使用任何会话词': 'recap.missingTargetWords',
    'AI 复盘没有可用的真实字幕句': 'recap.missingSubtitleLines',
    '模型未返回有效的复述点评': 'recap.invalidParaphraseReview',
    '模型未返回有效的场景回应点评': 'recap.invalidRolePlayReview',
};

interface PatternRule {
    pattern: RegExp;
    build: (match: RegExpExecArray) => BackendErrorMatch;
}

const PATTERN_RULES: readonly PatternRule[] = [
    {
        pattern: /^拒绝来自不可信页面或子帧的 IPC 请求 \((.+)\)$/,
        build: (m) => ({ key: 'ipc.untrustedOrigin', params: { path: m[1] } }),
    },
    {
        pattern: /^IPC 请求参数校验失败 \(([^)]+)\): ([\s\S]+)$/,
        build: (m) => ({ key: 'ipc.validationFailed', params: { path: m[1], detail: m[2] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^IPC 请求参数包含未声明字段 \(([^)]+)\): (.+?)(?:（schema 漏写或渲染端多传，请核对契约）)?$/,
        build: (m) => ({ key: 'ipc.unknownFields', params: { path: m[1], fields: m[2] } }),
    },
    {
        pattern: /^openai\.providers\.(.+)\.endpoint 仅支持 https:\/\/ 或本机\/局域网推理 http:\/\/ 地址$/,
        build: (m) => ({ key: 'validation.providerEndpointHttpsOrLan', params: { id: m[1] } }),
    },
    {
        pattern: /^openai\.providers\.(.+)\.models 包含空模型标识$/,
        build: (m) => ({ key: 'validation.providerEmptyModelId', params: { id: m[1] } }),
    },
    {
        pattern: /^openai\.providers\.(.+)\.models 包含重复模型标识$/,
        build: (m) => ({ key: 'validation.providerDuplicateModelId', params: { id: m[1] } }),
    },
    {
        pattern: /^当前模型未在服务配置中启用: (.+)$/,
        build: (m) => ({ key: 'ai.modelNotEnabled', params: { model: m[1] } }),
    },
    {
        pattern: /^未找到模型 (.+) 所属的 AI 服务商配置$/,
        build: (m) => ({ key: 'ai.providerNotFoundForModel', params: { model: m[1] } }),
    },
    {
        pattern: /^测试失败: ([\s\S]+)$/,
        build: (m) => ({ key: 'aiTest.openAiFailed', params: { detail: m[1] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^腾讯云测试失败: ([\s\S]+)$/,
        build: (m) => ({ key: 'aiTest.tencentFailed', params: { detail: m[1] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^设置项 (.+) 非法: ([\s\S]+)$/,
        build: (m) => ({ key: 'settings.invalidValue', params: { field: m[1], value: m[2] } }),
    },
    {
        pattern: /^不允许直接修改运行时设置: (.+)$/,
        build: (m) => ({ key: 'settings.readonlyRuntimeKey', params: { key: m[1] } }),
    },
    {
        pattern: /^未知的朗读音色：(.+)$/,
        build: (m) => ({ key: 'settings.unknownTtsVoice', params: { voiceId: m[1] } }),
    },
    {
        pattern: /^端口 (\d+) 启动失败：([\s\S]+)$/,
        build: (m) => ({ key: 'mobileAccess.portStartFailed', params: { port: Number(m[1]), detail: m[2] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^手机页资源缺失：(.+)$/,
        build: (m) => ({ key: 'mobileAccess.missingAssets', params: { path: m[1] } }),
    },
    {
        pattern: /^打开文件夹失败：([\s\S]+)$/,
        build: (m) => ({ key: 'system.openFolderFailed', params: { detail: m[1] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^打开日志目录失败：([\s\S]+)$/,
        build: (m) => ({ key: 'system.openLogsDirFailed', params: { detail: m[1] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^媒体文件不存在：(.+)$/,
        build: (m) => ({ key: 'media.fileNotFound', params: { path: m[1] } }),
    },
    {
        pattern: /^媒体路径未授权：(.+)$/,
        build: (m) => ({ key: 'media.unauthorizedPath', params: { path: m[1] } }),
    },
    {
        pattern: /^无法读取有效的媒体时长：(.+)$/,
        build: (m) => ({ key: 'media.invalidDuration', params: { path: m[1] } }),
    },
    {
        pattern: /^缩略图生成失败：(.+)$/,
        build: (m) => ({ key: 'media.thumbnailFailed', params: { path: m[1] } }),
    },
    {
        pattern: /^观看记录不存在：(.+)$/,
        build: (m) => ({ key: 'watchHistory.notFound', params: { id: m[1] } }),
    },
    {
        pattern: /^视频文件不存在：(.+)$/,
        build: (m) => ({ key: 'watchHistory.videoNotFound', params: { path: m[1] } }),
    },
    {
        pattern: /^字幕索引不存在：(.+)$/,
        build: (m) => ({ key: 'subtitle.indexNotFound', params: { index: m[1] } }),
    },
    {
        pattern: /^字幕索引无效: (.+)$/,
        build: (m) => ({ key: 'subtitle.invalidIndex', params: { index: m[1] } }),
    },
    {
        pattern: /^字幕需求标记无效: (.+)$/,
        build: (m) => ({ key: 'subtitle.invalidDemandId', params: { id: m[1] } }),
    },
    {
        pattern: /^字幕文件已存在：(.+)$/,
        build: (m) => ({ key: 'subtitleGeneration.fileExists', params: { path: m[1] } }),
    },
    {
        pattern: /^无法读取媒体时长：(.+)$/,
        build: (m) => ({ key: 'subtitleGeneration.invalidDuration', params: { duration: m[1] } }),
    },
    {
        pattern: /^字幕文件不存在：(.+)$/,
        build: (m) => ({ key: 'subtitle.fileNotFound', params: { path: m[1] } }),
    },
    {
        pattern: /^非法的人工编辑轨路径：(.+)$/,
        build: (m) => ({ key: 'subtitle.invalidEditedPath', params: { path: m[1] } }),
    },
    {
        pattern: /^字幕生词匹配上下文不存在：(.+)$/,
        build: (m) => ({ key: 'subtitle.vocabContextMissing', params: { fileHash: m[1] } }),
    },
    {
        pattern: /^导入完成：共 (\d+) 条，保留 (\d+) 条，新增 (\d+) 条，删除 (\d+) 条，已同步单词管理片段$/,
        build: (m) => ({
            key: 'vocabulary.importSummary',
            params: {
                total: Number(m[1]),
                retained: Number(m[2]),
                added: Number(m[3]),
                removed: Number(m[4]),
            },
        }),
    },
    {
        pattern: /^语境解读生成失败：([\s\S]+)$/,
        build: (m) => ({ key: 'wordInsight.failed', params: { detail: m[1] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^找不到 \.dict 或 \.dict\.dz 文件: (.+)$/,
        build: (m) => ({ key: 'importedDict.missingDictFile', params: { path: m[1] } }),
    },
    {
        pattern: /^导入词典注册表版本不匹配: (.+)$/,
        build: (m) => ({ key: 'importedDict.registryVersionMismatch', params: { file: m[1] } }),
    },
    {
        pattern: /^词典文件超过 (\d+) MB 上限，拒绝导入$/,
        build: (m) => ({ key: 'importedDict.fileTooLarge', params: { limitMb: Number(m[1]) } }),
    },
    {
        pattern: /^词典没有可用词条：(.+)$/,
        build: (m) => ({ key: 'importedDict.noUsableEntries', params: { path: m[1] } }),
    },
    {
        pattern: /^词典不存在：(.+)$/,
        build: (m) => ({ key: 'importedDict.notFound', params: { id: m[1] } }),
    },
    {
        pattern: /^不支持的词典格式：(.+?)。支持 StarDict\(.ifo\)、CSV\(.csv\)、SQLite\(.sqlite\/.db\)$/,
        build: (m) => ({ key: 'importedDict.unsupportedFormat', params: { ext: m[1] } }),
    },
    {
        pattern: /^WordNet 归档 sha256 不匹配：(.+)$/,
        build: (m) => ({ key: 'englishDict.sha256Mismatch', params: { hash: m[1] } }),
    },
    {
        pattern: /^WordNet 数据文件缺失：(.+)$/,
        build: (m) => ({ key: 'englishDict.missingDataFile', params: { file: m[1] } }),
    },
    {
        pattern: /^下载失败 HTTP (\d+)$/,
        build: (m) => ({ key: 'download.httpFailed', params: { status: Number(m[1]) } }),
    },
    {
        pattern: /^模型下载请求失败（HTTP (\d+)\s*([^）]*)）$/,
        build: (m) => ({ key: 'download.modelHttpFailed', params: { status: Number(m[1]), statusText: m[2].trim() } }),
    },
    {
        pattern: /^模型下载响应体为空：(.+)$/,
        build: (m) => ({ key: 'download.emptyResponseBody', params: { url: m[1] } }),
    },
    {
        pattern: /^磁盘空间不足：需要约 (\d+) MB，可用 (\d+) MB$/,
        build: (m) => ({
            key: 'download.insufficientDiskSpace',
            params: { requiredMb: Number(m[1]), availableMb: Number(m[2]) },
        }),
    },
    {
        pattern: /^(.+?)文件完整性校验失败 \((.+?) SHA256 不一致\)$/,
        build: (m) => ({ key: 'download.checksumMismatch', params: { model: m[1], file: m[2] } }),
    },
    {
        pattern: /^(.+?) 模型归档缺少文件：(.+)$/,
        build: (m) => ({ key: 'download.archiveMissingFiles', params: { model: m[1], files: m[2] } }),
    },
    {
        pattern: /^(.+?) 模型归档解压失败：([\s\S]+)$/,
        build: (m) => ({ key: 'download.archiveExtractFailed', params: { model: m[1], detail: m[2] }, nestedParam: 'detail' }),
    },
    {
        pattern: /^(.+?) 模型归档中未找到完整模型目录$/,
        build: (m) => ({ key: 'download.archiveMissingModelDir', params: { model: m[1] } }),
    },
    {
        pattern: /^(.+?)下载已取消$/,
        build: (m) => ({ key: 'download.cancelled', params: { model: m[1] } }),
    },
    {
        pattern: /^(.+?)(?:\s+模型)?已删除$/,
        build: (m) => ({ key: 'model.deleted', params: { model: m[1] } }),
    },
    {
        pattern: /^(.+?)(?:\s+模型)?已就绪$/,
        build: (m) => ({ key: 'model.ready', params: { model: m[1] } }),
    },
    {
        pattern: /^(.+?)(?: 模型下载完成|安装完成)$/,
        build: (m) => ({ key: 'model.installed', params: { model: m[1] } }),
    },
    {
        pattern: /^YouTube 导入暂不支持当前平台：(.+)$/,
        build: (m) => ({ key: 'youtube.unsupportedPlatform', params: { platform: m[1] } }),
    },
    {
        pattern: /^不存在内置预设：(.+)$/,
        build: (m) => ({ key: 'chat.missingPreset', params: { id: m[1] } }),
    },
];

/**
 * 尝试将后端抛出的原始中文业务文本匹配为结构化 `errors` 文案键与插值参数。
 *
 * @param message 原始错误或状态文本。
 * @returns 命中规则时返回键与参数，未命中返回 null。
 */
export function matchBackendMessage(message: string): BackendErrorMatch | null {
    const trimmed = message.trim();
    if (!trimmed) {
        return null;
    }
    const exactKey = EXACT_MESSAGES[trimmed];
    if (exactKey) {
        return { key: exactKey };
    }
    for (const rule of PATTERN_RULES) {
        const match = rule.pattern.exec(trimmed);
        if (match) {
            return rule.build(match);
        }
    }
    return null;
}

export type ErrorTranslateFn = (key: string, params?: Record<string, string | number>) => string;

function translateZodValidationIssues(detail: string, translate: ErrorTranslateFn): string {
    return detail
        .split('; ')
        .map((segment) => {
            const sep = segment.indexOf(': ');
            if (sep <= 0) {
                return translateBackendMessage(segment, translate, 1);
            }
            const field = segment.slice(0, sep);
            const rawIssue = segment.slice(sep + 2);
            const translatedIssue = translateBackendMessage(rawIssue, translate, 1);
            return `${field}: ${translatedIssue}`;
        })
        .join('; ');
}

/**
 * 使用调用方提供的翻译函数将后端消息本地化；未命中已知模板时原样返回。
 *
 * @param message 原始后端消息。
 * @param translate 按 `errors` 命名空间内键名（不含前缀）解析文案的函数。
 * @param depth 嵌套错误详情的递归深度，防止恶意输入引发无限递归。
 */
export function translateBackendMessage(
    message: string,
    translate: ErrorTranslateFn,
    depth = 0,
): string {
    const matched = matchBackendMessage(message);
    if (!matched) {
        return message;
    }

    const params = matched.params ? { ...matched.params } : undefined;
    if (params && typeof params.model === 'string') {
        const modelNameKey = MODEL_NAME_KEYS[params.model];
        if (modelNameKey) {
            params.model = translate(modelNameKey);
        }
    }
    if (params && matched.nestedParam && depth < 2) {
        const rawNested = params[matched.nestedParam];
        if (typeof rawNested === 'string') {
            params[matched.nestedParam] = matched.key === 'ipc.validationFailed'
                ? translateZodValidationIssues(rawNested, translate)
                : translateBackendMessage(rawNested, translate, depth + 1);
        }
    }

    return translate(matched.key, params);
}

/** 按点号路径从 JSON 语言包中读取字符串模板。 */
export function resolveBundleString(bundle: Record<string, unknown>, key: string): string | undefined {
    let cursor: unknown = bundle;
    for (const part of key.split('.')) {
        if (!cursor || typeof cursor !== 'object') {
            return undefined;
        }
        cursor = (cursor as Record<string, unknown>)[part];
    }
    return typeof cursor === 'string' ? cursor : undefined;
}

/** 基于静态 JSON 语言包创建轻量级翻译函数（不依赖 i18next 运行时初始化）。 */
export function createBundleTranslator(bundle: Record<string, unknown>): ErrorTranslateFn {
    return (key, params) => {
        const template = resolveBundleString(bundle, key);
        if (!template) {
            return key;
        }
        if (!params) {
            return template;
        }
        return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, name: string) =>
            name in params ? String(params[name]) : '',
        );
    };
}
