import { toast } from 'react-hot-toast';
import type { RegisterRendererApi } from '@/frontend/infrastructure/electron/rendererApiRegistry';
import i18n from '@/frontend/i18n';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import useDictionaryStream from '@/frontend/features/player/dictionaryStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import useTranslation from '@/frontend/features/player/translationStore';

const logger = getRendererLogger('PlayerEvents');

/**
 * 注册播放器相关的翻译、查词与字幕精修 main 进程回调通道。
 *
 * @param register 接口注册函数。
 */
export function registerPlayerRendererApis(register: RegisterRendererApi): void {
    register('translation/batch-result', async (params) => {
        useTranslation.getState().updateTranslations(params.translations);
    });

    register('dictionary/openai-update', async ({ requestId, word, data, isComplete = false }) => {
        logger.debug('Received OpenAI dictionary update', {
            requestId,
            word,
            isComplete,
            hasDefinitions: data.definitions.length,
        });

        useDictionaryStream.getState().receiveUpdate(requestId, word, data, isComplete);
    });

    register('subtitle/track-refined', async ({ videoId, subtitlePath }) => {
        if (!videoId || usePlaybackSession.getState().videoId !== videoId) {
            return;
        }
        try {
            const resolution = await playerApi.getPlayerSubtitle(videoId);
            const session = usePlaybackSession.getState();
            if (session.videoId !== videoId) {
                return;
            }
            if (typeof session.updateSubtitleResolution === 'function') {
                session.updateSubtitleResolution(resolution);
            } else if (resolution.subtitlePath || subtitlePath) {
                session.updateFile(resolution.subtitlePath || subtitlePath);
            }
            session.reloadSubtitles();
            toast.success(i18n.t('player:subtitleOrigin.autoRefinedDone'));
        } catch (error) {
            logger.warn('Failed to apply refined subtitle track', {
                videoId,
                subtitlePath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
