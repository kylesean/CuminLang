import { toast } from 'react-hot-toast';
import i18next from '@/frontend/i18n';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Button } from '@astryxdesign/core/Button';
import MediaUtil, {
    AllFormats,
    SupportedFormats,
} from '@/common/utils/MediaUtil';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { SWR_KEY, swrApiMutate, swrMutate } from '@/frontend/lib/swr-util';
import useLayout from '@/frontend/app/stores/layoutStore';
import StrUtil from '@/common/utils/str-util';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';
import { useTranslation } from 'react-i18next';
import { FileVideo } from 'lucide-react';

async function openFilesInPlayer(
    ps: string[],
    navigate: (s: string) => void,
    closeSideBar: boolean,
): Promise<void> {
    if (ps.length === 1 && MediaUtil.isSubtitle(ps[0])) {
        const videoPath = usePlaybackSession.getState().videoPath;
        if (!StrUtil.isNotBlank(videoPath)) {
            toast.error(i18next.t('common:subtitleRequiresVideo'));
            return;
        }
        await fileBrowserApi.attachSubtitle(videoPath, ps[0]);
        usePlaybackSession.getState().clearSrt();
    } else {
        // 格式兼容性引导统一由播放页负责（乐观播放 + 失败/无声检测），这里不再预检
        const [id] = await fileBrowserApi.createWatchHistory(ps);
        if (!id) {
            toast.error(i18next.t('common:openMediaFailed'));
            return;
        }
        await fileBrowserApi.changeWindowSize('player');
        if (closeSideBar) {
            useLayout.getState().changeSideBar(false);
        }
        navigate(`/player/${id}`);
    }
    await swrMutate(SWR_KEY.PLAYER_P);
    await swrApiMutate('watch-history/list');
    await swrMutate(SWR_KEY.WATCH_PROJECT_DETAIL);
}

export class FileAction {
    public static playerAction(navigate: (s: string) => void) {
        return async (ps: string[]) => openFilesInPlayer(ps, navigate, false);
    }

    public static playerAction2(navigate: (s: string) => void) {
        return async (ps: string[]) => openFilesInPlayer(ps, navigate, true);
    }
}

/**
 * 本地文件选择器组件入参。
 */
export interface FileSelectorProps {
    onSelected: (ps: string[]) => Promise<void>;
    withMkv?: boolean;
    className?: string;
}

/**
 * 打开本地媒体/字幕文件的通用按钮。
 */
export default function FileSelector({
    onSelected,
    withMkv = false,
    className = '',
}: FileSelectorProps) {
    const { t } = useTranslation('common');
    const handleClick = async () => {
        try {
            const ps = await fileBrowserApi.selectFiles(withMkv ? AllFormats : SupportedFormats);
            if (ps?.length > 0) {
                await onSelected(ps);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('selectFileFailed'));
        }
    };

    return (
        <Tooltip content={t('fileSelectorHint')} placement="below">
            <Button
                variant="secondary"
                label={t('openFile')}
                icon={<FileVideo className="h-4 w-4" />}
                onClick={() => void handleClick()}
                width="100%"
                className={className}
            />
        </Tooltip>
    );
}
