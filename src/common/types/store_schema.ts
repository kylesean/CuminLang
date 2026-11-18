export const SettingKeyObj = {
    'shortcut.previousSentence': 'left,a',
    'shortcut.nextSentence': 'right,d',
    'shortcut.repeatSentence': 'down,s',
    'shortcut.playPause': 'space,up,w',
    'shortcut.repeatSingleSentence': 'r',
    'shortcut.autoPause': 'u',
    'shortcut.toggleEnglishDisplay': 'e',
    'shortcut.toggleChineseDisplay': 'c',
    'shortcut.toggleWordLevelDisplay': 'l',
    'shortcut.toggleBilingualDisplay': 'b',
    'shortcut.nextTheme': 't',
    'shortcut.adjustBeginMinus': 'z',
    'shortcut.adjustBeginPlus': 'x',
    'shortcut.adjustEndMinus': 'n',
    'shortcut.adjustEndPlus': 'm',
    'shortcut.clearAdjust': 'v',
    'shortcut.nextPlaybackRate': 'p',
    'shortcut.aiChat': 'slash',
    'shortcut.openControlPanel': 'shift+p',
    'shortcut.volumeUp': ']',
    'shortcut.volumeDown': '[',
    'shortcut.seekBackward': 'j',
    'shortcut.seekForward': 'k',
    'userSelect.playbackRateStack':'',
    'apiKeys.tencent.secretId': '',
    'apiKeys.tencent.secretKey': '',
    'apiKeys.openAi.providerKeys': '',
    'transcription.engine': 'whisper-cpp',
    'providers.subtitleTranslation': 'none',
    'providers.dictionary': 'none',
    /** 语义向量提供方：'auto' | 'local' | 'openai' | 'none'。 */
    'providers.embedding': 'auto',
    'features.openai.enableSentenceLearning': 'false',
    'features.openai.subtitleTranslationMode': 'zh',
    'features.openai.subtitleCustomStyle': '',
    'learning.activePromptPresetId': 'image-schema-tutor',
    'models.openai.activeProviderId': 'deepseek',
    'models.openai.providers': '',
    'models.openai.sentenceLearning': '',
    'models.openai.subtitleTranslation': '',
    'models.openai.dictionary': '',
    /** 可选云端语义向量模型标识（如 text-embedding-3-small / gemini-embedding-001）。 */
    'models.openai.embedding': '',
    'appearance.theme': 'light',
    'appearance.themeFamily': 'neutral',
    'appearance.fontSize': 'fontSizeLarge',
    'appearance.transcriptPosition': 'right',
    'i18n.language': 'system',
    'player.autoPlayNext': 'false',
    'player.pauseOnWordHover': 'false',
    'player.vocabularyGuidance': 'calm',
    'player.adaptiveChinese': 'true',
    'player.sceneCues': 'false',
    /**
     * 离线朗读音色标识（见 SHERPA_TTS_VOICES）。
     * 默认取高拟真 Kokoro 美音女声（Bella），自然度与呼吸感远超早期 Piper；
     * 已设置过该键的老用户保持原值，未下载 Kokoro 时合成会自动回退到已安装的离线音色。
     */
    'tts.voice': 'kokoro-en-US-bella',
    'storage.path': '',
    'proxy.mode': 'system',
    'proxy.url': '',
    'proxy.bypass_rules': '',
    'mobileAccess.enabled': 'false',
    'mobileAccess.port': '27182',
    /**
     * 手机访问令牌：为空表示尚未生成，首次开启手机访问时由主进程生成并落盘。
     * 一旦生成就保持稳定，重新生成需要用户显式触发。
     */
    'mobileAccess.token': '',
    'youtubeImport.enabled': 'true',
    'youtubeImport.cookiesFilePath': '',
    /** 是否在本地 ASR 模型就绪时，自动在后台为仅有外部字幕的视频生成对齐的 .local.srt 轨道。 */
    'subtitle.autoRefineWithLocalAsr': 'true',
}
export type SettingKey = keyof typeof SettingKeyObj;

/**
 * 含敏感凭据的设置键列表（统一供后端加密存储与 QA 证据快照脱敏共享，防止两处清单漂移）。
 */
export const SECRET_SETTING_KEYS: readonly SettingKey[] = [
    'apiKeys.tencent.secretId',
    'apiKeys.tencent.secretKey',
    'apiKeys.openAi.providerKeys',
    'mobileAccess.token',
    'proxy.url',
];
