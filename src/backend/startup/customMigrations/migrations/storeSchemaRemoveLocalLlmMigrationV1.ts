import type { CustomMigration } from '../types';

const LEGACY_LOCAL_SUBTITLE_ENGINES = new Set(['local', 'local-mt']);

export const storeSchemaRemoveLocalLlmMigrationV1: CustomMigration = {
    id: 'store-schema-remove-local-llm-v1',
    description: 'Clear deprecated built-in local LLM engine settings and legacy models.local.active key',
    /**
     * 下线内置本地 LLM 引擎与回退路径：
     * - 字幕翻译/词典若曾指向 `'local'` 或 `'local-mt'`，显式改为 `'none'`（功能未配置）；
     * - 整句讲解模型若曾指向 `'local'`，清空槽位并关闭开关；
     * - 删除已废弃的 `'models.local.active'` 持久化键。
     */
    run: async (ctx) => {
        const subtitleEngine = ctx.settings.getPersisted('providers.subtitleTranslation');
        if (subtitleEngine && LEGACY_LOCAL_SUBTITLE_ENGINES.has(subtitleEngine)) {
            ctx.settings.set('providers.subtitleTranslation', 'none');
            ctx.logger.info('migrated legacy local subtitle translation engine to none', {
                previous: subtitleEngine,
            });
        }

        const dictionaryEngine = ctx.settings.getPersisted('providers.dictionary');
        if (dictionaryEngine === 'local') {
            ctx.settings.set('providers.dictionary', 'none');
            ctx.logger.info('migrated legacy local dictionary engine to none');
        }

        const sentenceModel = ctx.settings.getPersisted('models.openai.sentenceLearning');
        if (sentenceModel === 'local') {
            ctx.settings.set('models.openai.sentenceLearning', '');
            ctx.settings.set('features.openai.enableSentenceLearning', 'false');
            ctx.logger.info('cleared legacy local sentenceLearning model slot and disabled sentence learning');
        }

        if (ctx.settings.hasPersisted('models.local.active')) {
            ctx.settings.delete('models.local.active');
            ctx.logger.info('deleted legacy models.local.active setting');
        }
    },
};
