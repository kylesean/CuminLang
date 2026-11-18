/**
 * 播放页的确定性 dev/qa 入口：`#/player/<任意>?file=<视频绝对路径>&seek=<秒>&lang=<en|zh>`。
 *
 * 为什么需要它：播放页的正规入口是「入库 → 在列表里点进去 → 拖进度条」，
 * 每一步都牵着扫描、缩略图和真实点击，自动化用例要先复现这一长串前置才能测一条滚动行为。
 * 这里只做一件事——用应用自己的入库接口（`watch-history/create`）把路径变成观看记录，
 * 其余（字幕解析、播放、滚动）全部走正常流程，不伪造任何媒体或字幕状态。
 *
 * `?file=` 只在开发/未打包运行时生效（判据为 main 进程下发的 `devMode`）；
 * 打包版即使手工拼出这个参数也会被完全忽略。
 */
import { useEffect, useMemo, useState } from 'react';
import { playerApi } from '@/frontend/features/player/playerApi';
import { resolveDevMode } from '@/frontend/lib/devMode';
import { applyLanguageSetting } from '@/frontend/i18n';
import { swrApiMutate } from '@/frontend/lib/swr-util';
import StrUtil from '@/common/utils/str-util';

/** dev 入口的解析状态。 */
export type DevPlayerEntryStatus =
    /** 没要求 dev 入口（打包版里的 `?file=` 也归到这里） */
    | 'idle'
    /** 正在用路径换观看记录 */
    | 'resolving'
    /** 已拿到观看记录 */
    | 'ready'
    /** 路径换不到记录（文件不存在/不是媒体） */
    | 'failed';

/** dev 入口的解析结果。 */
export interface DevPlayerEntry {
    status: DevPlayerEntryStatus;
    /** URL 上是否带了 `?file=`。 */
    requested: boolean;
    /** 由 `?file=` 换来的观看记录 ID。 */
    videoId: string | null;
    /** 需要跳转到的播放位置（秒）；没有该参数为 null。 */
    seekSeconds: number | null;
}

/**
 * 解析 `seek` 参数。
 *
 * @param raw URL 上的原始值。
 * @returns 秒数；非法值或未提供时为 null。
 */
const parseSeek = (raw: string | null): number | null => {
    if (raw === null || StrUtil.isBlank(raw)) {
        return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
};

/**
 * 读取并处理播放页的 dev 入口参数。
 *
 * @param searchParams 当前路由的 query 参数。
 * @returns 入口状态、观看记录 ID 与 seek 位置。
 */
export function useDevPlayerEntry(searchParams: URLSearchParams): DevPlayerEntry {
    const file = searchParams.get('file');
    const seekRaw = searchParams.get('seek');
    const lang = searchParams.get('lang');
    const seekSeconds = useMemo(() => parseSeek(seekRaw), [seekRaw]);
    const entryKey = file ? `${file}\0${lang ?? ''}` : null;

    const [resolved, setResolved] = useState<{
        forKey: string | null;
        status: DevPlayerEntryStatus;
        videoId: string | null;
    }>({
        forKey: null,
        status: 'idle',
        videoId: null,
    });

    useEffect(() => {
        if (!file || !entryKey) {
            return undefined;
        }
        let cancelled = false;
        void (async () => {
            const devMode = await resolveDevMode();
            if (cancelled) {
                return;
            }
            if (!devMode) {
                // 打包版不认这个参数：按「没有 dev 入口」处理，交给正规流程报错/空态
                setResolved({ forKey: entryKey, status: 'idle', videoId: null });
                return;
            }
            if (lang === 'zh' || lang === 'en') {
                await applyLanguageSetting(lang === 'zh' ? 'zh-CN' : 'en-US');
            }
            // 走应用自己的入库接口：路径存在就复用已有记录，重复进入同一路径不会产生重复记录
            const ids = await playerApi.createWatchHistoryEntries([file]);
            if (cancelled) {
                return;
            }
            if (ids.length > 0) {
                void swrApiMutate('watch-history/list/basic');
                void swrApiMutate('watch-history/list');
            }
            setResolved({
                forKey: entryKey,
                status: ids.length > 0 ? 'ready' : 'failed',
                videoId: ids[0] ?? null,
            });
        })().catch(() => {
            if (!cancelled) {
                setResolved({ forKey: entryKey, status: 'failed', videoId: null });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [entryKey, file, lang]);

    if (!entryKey) {
        return {
            status: 'idle',
            requested: false,
            videoId: null,
            seekSeconds,
        };
    }

    if (resolved.forKey !== entryKey) {
        return {
            status: 'resolving',
            requested: true,
            videoId: null,
            seekSeconds,
        };
    }

    return {
        status: resolved.status,
        requested: true,
        videoId: resolved.videoId,
        seekSeconds,
    };
}
