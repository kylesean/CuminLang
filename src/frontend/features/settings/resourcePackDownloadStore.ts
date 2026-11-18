import { useSyncExternalStore } from 'react';
import {
    subscribeArchiveDownloadProgress,
    type ArchiveProgressSource,
} from '@/frontend/features/settings/settingsEvents';
import { createDownloadProgressTracker, type DownloadLiveSnapshot } from '@/frontend/lib/downloadProgressTracker';
import type { ModelDownloadPhase } from '@/common/contracts/model-download-phase';

export const SETTINGS_RESOURCE_PACK_ID = 'settings-resource-pack';
export const SETTINGS_EXTENSIONS_PACK_ID = 'settings-extensions-pack';
export const TTS_VOICE_DOWNLOAD_ID = 'settings-tts-voice';

const PROGRESS_RENDER_INTERVAL_MS = 200;
const SPEED_SMOOTHING = 0.25; // 本页调参档（偏稳重），算法见 downloadProgressTracker

export interface DownloadLiveStats {
    percent: number;
    downloaded: number;
    total: number;
    speed: number;
}

export interface PackDownloadProgress {
    completed: number;
    count: number;
}

export interface PackDownloadEntry {
    key: string;
    download: () => Promise<void>;
    cancel: () => Promise<void>;
}

export interface PackDownloadState {
    downloading: boolean;
    cancelling: boolean;
    activeItemKey: string | null;
    queuedKeys: string[];
    activePhase: ModelDownloadPhase | null;
    packProgress: PackDownloadProgress;
    live: DownloadLiveStats;
    error: string | null;
}

export const INITIAL_PACK_DOWNLOAD_STATE: PackDownloadState = {
    downloading: false,
    cancelling: false,
    activeItemKey: null,
    queuedKeys: [],
    activePhase: null,
    packProgress: { completed: 0, count: 0 },
    live: { percent: 0, downloaded: 0, total: 0, speed: 0 },
    error: null,
};

interface PackRuntime {
    epoch: number;
    cancelRequested: boolean;
    activeEntry: PackDownloadEntry | null;
    queuedKeys: Set<string>;
    tracker: ReturnType<typeof createDownloadProgressTracker>;
    renderTimer: ReturnType<typeof setInterval> | null;
    unsubscribeProgress: (() => void) | null;
    onRefresh?: () => void;
    onComplete?: () => void;
}

function matchesArchiveSource(entryKey: string, source?: ArchiveProgressSource): boolean {
    if (!source) return true;
    if (entryKey === 'tts') return source === 'tts';
    if (entryKey === 'transcription') return source === 'whisper-cpp' || source === 'parakeet';
    if (entryKey === 'diarization') return source === 'diarization';
    if (entryKey === 'phonemeGop') return source === 'phonemeGop';
    if (entryKey === 'senseVoice') return source === 'senseVoice';
    return false;
}

const packStates = new Map<string, PackDownloadState>();
const packRuntimes = new Map<string, PackRuntime>();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

function setPackState(packId: string, updater: (prev: PackDownloadState) => PackDownloadState): void {
    const prev = packStates.get(packId) ?? INITIAL_PACK_DOWNLOAD_STATE;
    packStates.set(packId, updater(prev));
    notify();
}

function stopRuntimeTimers(runtime: PackRuntime): void {
    if (runtime.renderTimer !== null) {
        clearInterval(runtime.renderTimer);
        runtime.renderTimer = null;
    }
    if (runtime.unsubscribeProgress) {
        runtime.unsubscribeProgress();
        runtime.unsubscribeProgress = null;
    }
}

export function getPackDownloadState(packId: string): PackDownloadState {
    return packStates.get(packId) ?? INITIAL_PACK_DOWNLOAD_STATE;
}

export function subscribePackDownloadState(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * 在组件树外持久化执行串行资源包下载队列。
 * 切换标签页或离开设置页不会中断下载或丢失进度，重新挂载卡片后会立即恢复进度视图。
 */
export async function startPackDownload(options: {
    packId: string;
    entries: PackDownloadEntry[];
    onRefresh?: () => void;
    onComplete?: () => void;
}): Promise<void> {
    const { packId, entries, onRefresh, onComplete } = options;
    const current = getPackDownloadState(packId);
    if (current.downloading || entries.length === 0) {
        return;
    }

    // 防止不同包（如核心资源包与音色卡片）并发下载同一资源项导致进度与后端状态冲突
    for (const [otherPackId, otherState] of packStates.entries()) {
        if (otherPackId === packId || !otherState.downloading) continue;
        const otherRuntime = packRuntimes.get(otherPackId);
        if (!otherRuntime) continue;
        if (entries.some((entry) => otherRuntime.queuedKeys.has(entry.key))) {
            return;
        }
    }

    const prevRuntime = packRuntimes.get(packId);
    if (prevRuntime) {
        stopRuntimeTimers(prevRuntime);
    }

    const epoch = (prevRuntime?.epoch ?? 0) + 1;
    const runtime: PackRuntime = {
        epoch,
        cancelRequested: false,
        activeEntry: null,
        queuedKeys: new Set(entries.map((entry) => entry.key)),
        tracker: createDownloadProgressTracker(SPEED_SMOOTHING),
        renderTimer: null,
        unsubscribeProgress: null,
        onRefresh,
        onComplete,
    };
    packRuntimes.set(packId, runtime);

    runtime.unsubscribeProgress = subscribeArchiveDownloadProgress((detail) => {
        if (packRuntimes.get(packId)?.epoch !== epoch) return;
        const activeKey = runtime.activeEntry?.key;
        if (!activeKey || !matchesArchiveSource(activeKey, detail.source)) {
            return;
        }
        setPackState(packId, (prev) => ({ ...prev, activePhase: detail.phase }));
        if (detail.phase === 'downloading' && detail.total > 0) {
            runtime.tracker.track(detail.downloaded, detail.total);
        }
        if (detail.phase === 'idle') {
            runtime.onRefresh?.();
        }
    });

    runtime.renderTimer = setInterval(() => {
        if (packRuntimes.get(packId)?.epoch !== epoch) return;
        const snap: DownloadLiveSnapshot = { ...runtime.tracker.getSnapshot() };
        setPackState(packId, (prev) => {
            if (
                prev.live.percent === snap.percent
                && prev.live.downloaded === snap.downloaded
                && prev.live.total === snap.total
                && prev.live.speed === snap.speed
            ) {
                return prev;
            }
            return { ...prev, live: snap };
        });
    }, PROGRESS_RENDER_INTERVAL_MS);

    setPackState(packId, () => ({
        downloading: true,
        cancelling: false,
        activeItemKey: null,
        queuedKeys: entries.map((entry) => entry.key),
        activePhase: null,
        packProgress: { completed: 0, count: entries.length },
        live: { percent: 0, downloaded: 0, total: 0, speed: 0 },
        error: null,
    }));

    try {
        for (const entry of entries) {
            runtime.activeEntry = entry;
            runtime.tracker.reset();
            setPackState(packId, (prev) => ({
                ...prev,
                activeItemKey: entry.key,
                activePhase: null,
                live: { percent: 0, downloaded: 0, total: 0, speed: 0 },
            }));
            await entry.download();
            runtime.queuedKeys.delete(entry.key);
            if (runtime.cancelRequested || packRuntimes.get(packId)?.epoch !== epoch) {
                break;
            }
            setPackState(packId, (prev) => ({
                ...prev,
                queuedKeys: prev.queuedKeys.filter((k) => k !== entry.key),
                packProgress: { ...prev.packProgress, completed: prev.packProgress.completed + 1 },
            }));
        }
        if (!runtime.cancelRequested && packRuntimes.get(packId)?.epoch === epoch) {
            runtime.onComplete?.();
        }
    } catch (err) {
        if (!runtime.cancelRequested && packRuntimes.get(packId)?.epoch === epoch) {
            const message = err instanceof Error ? err.message : String(err);
            setPackState(packId, (prev) => ({ ...prev, error: message }));
        }
    } finally {
        stopRuntimeTimers(runtime);
        if (packRuntimes.get(packId)?.epoch === epoch) {
            runtime.activeEntry = null;
            runtime.queuedKeys.clear();
            setPackState(packId, (prev) => ({
                ...prev,
                downloading: false,
                cancelling: false,
                activeItemKey: null,
                queuedKeys: [],
                activePhase: null,
            }));
            runtime.onRefresh?.();
        }
    }
}

export function updatePackCallbacks(packId: string, callbacks: { onRefresh?: () => void; onComplete?: () => void }): void {
    const runtime = packRuntimes.get(packId);
    if (runtime) {
        runtime.onRefresh = callbacks.onRefresh;
        runtime.onComplete = callbacks.onComplete;
    }
}

export async function cancelPackDownload(packId: string): Promise<void> {
    const runtime = packRuntimes.get(packId);
    if (!runtime) return;
    runtime.cancelRequested = true;
    setPackState(packId, (prev) => ({ ...prev, cancelling: true }));
    const entry = runtime.activeEntry;
    if (!entry) return;
    try {
        await entry.cancel();
    } finally {
        runtime.onRefresh?.();
    }
}

export function usePackDownloadState(packId: string): PackDownloadState {
    return useSyncExternalStore(
        subscribePackDownloadState,
        () => getPackDownloadState(packId),
        () => INITIAL_PACK_DOWNLOAD_STATE,
    );
}

export function resetPackDownloadStateForTests(): void {
    for (const runtime of packRuntimes.values()) {
        stopRuntimeTimers(runtime);
    }
    packRuntimes.clear();
    packStates.clear();
    notify();
}
