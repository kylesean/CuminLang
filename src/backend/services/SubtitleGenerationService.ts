import path from 'path';
import { inject, injectable, optional } from 'inversify';
import { getMainLogger } from '@/backend/infrastructure/logger';
import TYPES from '@/backend/ioc/types';
import type DpTaskService from '@/backend/services/DpTaskService';
import type FfmpegService from '@/backend/services/FfmpegService';
import type SubtitleAssetMigrationService from '@/backend/services/SubtitleAssetMigrationService';
import type WatchHistoryService from '@/backend/services/WatchHistoryService';
import type TranscriptionEngineSelector from '@/backend/services/TranscriptionEngineSelector';
import type { SettingsStore } from '@/backend/services/gateways/SettingsStore';
import type SpeechRecognitionGateway from '@/backend/services/gateways/media/SpeechRecognitionGateway';
import type { SpeechRecognitionToken } from '@/backend/services/gateways/media/SpeechRecognitionGateway';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import { StorageDirectoryTarget } from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type LocalModelService from '@/backend/services/models/LocalModelService';
import MatchSrt from '@/backend/utils/MatchSrt';
import { ObjUtil } from '@/backend/utils/ObjUtil';
import { CancelByUserError } from '@/backend/utils/errors/errors';
import { reconcileAudioAndTextSubtitles } from '@/backend/utils/subtitle/AudioTextReconciler';
import EnglishSubtitleSegmenter from '@/backend/utils/subtitle/EnglishSubtitleSegmenter';
import { DpTaskState } from '@/common/contracts/dp-task';
import type { SubtitleResolution, SubtitleTrackOrigin } from '@/common/contracts/subtitle-resolution';
import MediaUtil from '@/common/utils/MediaUtil';
import {
    isAuthoritativeSubtitlePath,
    parseAss,
    parseSrt,
    type SrtLine,
} from '@/common/utils/subtitle';
import { toSrtContent } from '@/common/utils/subtitle/parser';
import { resegmentIntoMeaningGroups } from '@/common/utils/subtitle/meaning-group-segmenter';
import {
    inspectSubtitleTrackDiagnostics,
    LOCAL_ASR_TRACK_SUFFIX,
    USER_EDITED_TRACK_SUFFIX,
} from '@/common/utils/subtitle/track-diagnostics';

/** 单个识别分片的核心时长（秒）：严格控制在 24s 内（含前后重叠总长 ≤ 30s），避免 parakeet-tdt 长窗口出现 TDT 静音崩塌或 Vulkan 显存暴涨。 */
const CHUNK_SECONDS = 24;
/** 相邻分片在切分点两侧各延展的重叠时长（秒）：确保双侧均具备 1.5s 声学上下文以供词级锚点平滑衔接。 */
const CHUNK_OVERLAP_SECONDS = 1.5;
/** 尾片小于该阈值时直接并入上一分片（仍满足 ≤ 30s），避免为极短残片额外起一次识别进程。 */
const MIN_TAIL_CHUNK_SECONDS = 4.5;

/**
 * 为指定媒体时长规划本地 ASR 分片抽取区间与词级合并切分点。
 *
 * 每个分片严格控制总长 ≤ 30s，且除尾片外切分点均落于前后相邻分片的 ±1.5s 重叠窗中心。
 */
export function buildRecognitionChunkPlan(duration: number): {
    ranges: Array<{ start: number; end: number }>;
    cutPoints: number[];
} {
    const ranges: Array<{ start: number; end: number }> = [];
    const cutPoints: number[] = [];
    let cursor = 0;

    while (cursor < duration) {
        const nextBoundary = cursor + CHUNK_SECONDS;
        const remainingAfterNext = duration - nextBoundary;
        const isLastChunk = remainingAfterNext <= MIN_TAIL_CHUNK_SECONDS;
        const rangeEnd = isLastChunk ? duration : Math.min(duration, nextBoundary + CHUNK_OVERLAP_SECONDS);
        const rangeStart = Math.max(0, cursor - CHUNK_OVERLAP_SECONDS);

        ranges.push({ start: rangeStart, end: rangeEnd });
        cutPoints.push(cursor);

        if (isLastChunk) {
            break;
        }
        cursor = nextBoundary;
    }

    return { ranges, cutPoints };
}

export interface SubtitleGenerationOptions {
    /**
     * 为已有字幕的视频生成/刷新一份独立的本地识别轨（`<stem>.local.srt`），
     * 不覆盖原有外挂或平台字幕，并自动将当前观看记录切换至新轨道。
     */
    regenerate?: boolean;
    /** 明确指定作为对账参考与资产迁移来源的当前字幕路径。 */
    sourceSubtitlePath?: string;
    /** 后台静默自动精修模式：完成后通过 `subtitle/track-refined` 通知前端热切换。 */
    silent?: boolean;
}

interface PreGenerationContext {
    migrationSource: {
        fileHash: string;
        sentences: SrtLine[];
    } | null;
    externalReference: {
        lines: SrtLine[];
        origin: SubtitleTrackOrigin;
    } | null;
}

/**
 * 为无字幕、外挂粗糙字幕或需要重生成字幕的视频生成并精修本地权威 `.local.srt` 字幕。
 */
export default interface SubtitleGenerationService {
    /**
     * 启动一次字幕生成/精修后台任务。
     *
     * @param videoId 观看历史记录 ID。
     * @param options 可选生成参数。
     * @returns 后台任务 ID；进度与结果经 dp-task 推送。
     */
    start(videoId: string, options?: SubtitleGenerationOptions): Promise<number>;

    /**
     * 取消指定任务并终止底层识别进程。
     *
     * @param taskId 后台任务 ID。
     */
    cancel(taskId: number): void;

    /**
     * 当视频尚无 L2（`.local.srt`）/ L3（`.edited.srt`）权威字幕且本地识别模型已就绪时，
     * 在后台静默启动一次音文对账精修；已尝试过、正在生成或用户关闭该设置时跳过。
     */
    scheduleAutoRefine(videoId: string, resolution?: SubtitleResolution): Promise<void>;
}

/**
 * 编排：抽取音频分片 → 本地 ASR 识别 → 音文双向对账 → DP 意群分句 → 学习资产迁移 → 写 `.local.srt` 并热切换。
 */
@injectable()
export class SubtitleGenerationServiceImpl implements SubtitleGenerationService {
    private readonly logger = getMainLogger('SubtitleGenerationService');
    private readonly segmenter = new EnglishSubtitleSegmenter();
    /** 任务 ID → 当前使用的识别网关，取消时用于终止底层进程。 */
    private readonly gatewayByTask = new Map<number, SpeechRecognitionGateway>();
    /** 已请求取消的任务集合；供识别网关的 isCancelled 轮询。 */
    private readonly cancelledTasks = new Set<number>();
    /** 正在生成字幕的视频路径集合，防止同一视频并发生成互相覆盖。 */
    private readonly activeVideos = new Set<string>();
    /** 本会话已触发过后台静默精修的视频路径集合，避免反复触发。 */
    private readonly attemptedAutoRefine = new Set<string>();

    constructor(
        @inject(TYPES.DpTaskService) private readonly dpTaskService: DpTaskService,
        @inject(TYPES.WatchHistoryService) private readonly watchHistoryService: WatchHistoryService,
        @inject(TYPES.FfmpegService) private readonly ffmpegService: FfmpegService,
        @inject(TYPES.TranscriptionEngineSelector) private readonly engineSelector: TranscriptionEngineSelector,
        @inject(TYPES.StorageDirectoryProvider) private readonly storageDirectoryProvider: StorageDirectoryProvider,
        @inject(TYPES.FileSystemGateway) private readonly fileSystemGateway: FileSystemGateway,
        @optional() @inject(TYPES.SubtitleAssetMigrationService)
        private readonly assetMigrationService?: SubtitleAssetMigrationService,
        @optional() @inject(TYPES.RendererGateway)
        private readonly rendererGateway?: RendererGateway,
        @optional() @inject(TYPES.SettingsStore)
        private readonly settingsStore?: SettingsStore,
        @optional() @inject(TYPES.ParakeetModelService)
        private readonly parakeetModelService?: LocalModelService,
        @optional() @inject(TYPES.WhisperCppModelService)
        private readonly whisperCppModelService?: LocalModelService,
    ) {}

    /**
     * 启动字幕生成/对账精修任务。
     *
     * @param videoId 观看历史记录 ID。
     * @returns 后台任务 ID。
     * @throws 视频不存在或非重生成模式下同名 `.local.srt` 已存在时抛出，不做静默覆盖。
     */
    public async start(videoId: string, options?: SubtitleGenerationOptions): Promise<number> {
        const videoPath = await this.watchHistoryService.videoPath(videoId);
        if (this.activeVideos.has(videoPath)) {
            throw new Error('该视频正在生成字幕中，请等待完成后再试');
        }
        this.activeVideos.add(videoPath);
        const regenerate = Boolean(options?.regenerate);
        const srtPath = this.srtPathOf(videoPath);
        try {
            if (!regenerate && await this.fileSystemGateway.fileExists(srtPath)) {
                throw new Error(`字幕文件已存在：${srtPath}`);
            }
            const taskId = await this.dpTaskService.create();
            void this.run(taskId, videoId, videoPath, srtPath, options);
            return taskId;
        } catch (error) {
            this.activeVideos.delete(videoPath);
            throw error;
        }
    }

    /**
     * 取消任务：同时标记轮询状态并终止底层识别进程。
     *
     * @param taskId 后台任务 ID。
     */
    public cancel(taskId: number): void {
        this.cancelledTasks.add(taskId);
        this.dpTaskService.cancel(taskId);
        this.gatewayByTask.get(taskId)?.cancelActive(this.jobOf(taskId));
    }

    /** @inheritdoc */
    public async scheduleAutoRefine(videoId: string, resolution?: SubtitleResolution): Promise<void> {
        try {
            if (!videoId || !this.settingsStore) {
                return;
            }
            if (this.settingsStore.get('subtitle.autoRefineWithLocalAsr') === 'false') {
                return;
            }
            if (resolution?.origin === 'user_edited' || resolution?.origin === 'local_asr') {
                return;
            }
            if (resolution?.tracks?.some((track) => track.origin === 'user_edited' || track.origin === 'local_asr')) {
                return;
            }

            const videoPath = await this.watchHistoryService.videoPath(videoId);
            if (!videoPath || this.activeVideos.has(videoPath) || this.attemptedAutoRefine.has(videoPath)) {
                return;
            }
            if (await this.hasAuthoritativeTrackOnDisk(videoPath)) {
                return;
            }
            if (!await this.isSelectedAsrModelReady()) {
                return;
            }
            if (this.activeVideos.has(videoPath) || this.attemptedAutoRefine.has(videoPath)) {
                return;
            }

            this.attemptedAutoRefine.add(videoPath);
            await this.start(videoId, {
                regenerate: true,
                sourceSubtitlePath: resolution?.subtitlePath,
                silent: true,
            });
        } catch (error) {
            this.logger.warn('auto subtitle refine skipped', {
                videoId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** 与视频同目录的标准本地识别轨路径（`<stem>.local.srt`）。 */
    private srtPathOf(videoPath: string): string {
        return this.companionPathOf(videoPath, LOCAL_ASR_TRACK_SUFFIX);
    }

    private companionPathOf(videoPath: string, suffix: string): string {
        return path.join(
            path.dirname(videoPath),
            `${path.basename(videoPath, path.extname(videoPath))}${suffix}`,
        );
    }

    /** 检查磁盘上是否已存在 L2（`.local.srt`）或 L3（`.edited.srt`）权威轨。 */
    private async hasAuthoritativeTrackOnDisk(videoPath: string): Promise<boolean> {
        const standardPaths = [
            this.companionPathOf(videoPath, USER_EDITED_TRACK_SUFFIX),
            this.companionPathOf(videoPath, LOCAL_ASR_TRACK_SUFFIX),
        ];
        for (const candidate of standardPaths) {
            if (await this.fileSystemGateway.fileExists(candidate)) {
                return true;
            }
        }
        try {
            const folder = path.dirname(videoPath);
            const names = await this.fileSystemGateway.listFileNames(folder);
            const srtPaths = names
                .filter((name) => MediaUtil.isSrt(name))
                .map((name) => path.join(folder, name));
            return MatchSrt.matchExactTracks(videoPath, srtPaths)
                .some((trackPath) => isAuthoritativeSubtitlePath(trackPath));
        } catch {
            return false;
        }
    }

    /** 检查当前设置所选本地语音识别模型是否已在磁盘就绪。 */
    private async isSelectedAsrModelReady(): Promise<boolean> {
        const engine = this.engineSelector.currentEngine();
        const modelService = engine === 'whisper-cpp'
            ? this.whisperCppModelService
            : this.parakeetModelService;
        if (!modelService) {
            return false;
        }
        const status = await modelService.getStatus();
        return Boolean(status?.ready);
    }

    /**
     * 在覆写 `.local.srt` 之前捕获：
     * 1. 当前激活字幕的内容哈希与分句序列（供学习资产迁移匹配）；
     * 2. 同视频最好的非权威 L1 外部 `.srt` 字幕（供音文对账使用）。
     */
    private async capturePreGenerationContext(
        videoId: string,
        videoPath: string,
        hintSourcePath?: string,
    ): Promise<PreGenerationContext> {
        let activePath = hintSourcePath ?? '';
        if (!activePath) {
            try {
                const current = await this.watchHistoryService.playerSubtitle(videoId);
                activePath = current?.subtitlePath ?? '';
            } catch {
                activePath = '';
            }
        }

        const migrationSource = await this.readMigrationSnapshot(activePath);
        const externalReference = await this.resolveExternalReferenceTrack(videoPath, activePath);
        return { migrationSource, externalReference };
    }

    private async readMigrationSnapshot(
        subtitlePath: string,
    ): Promise<PreGenerationContext['migrationSource']> {
        if (!subtitlePath || !MediaUtil.isSubtitle(subtitlePath)) {
            return null;
        }
        try {
            if (!await this.fileSystemGateway.fileExists(subtitlePath)) {
                return null;
            }
            const raw = await this.fileSystemGateway.readTextFile(subtitlePath);
            const fileHash = ObjUtil.hash(raw);
            const parsed = MediaUtil.isAss(subtitlePath) ? parseAss(raw) : parseSrt(raw);
            const sentences = isAuthoritativeSubtitlePath(subtitlePath)
                ? parsed.map((line, index) => ({ ...line, index: index + 1 }))
                : resegmentIntoMeaningGroups(parsed);
            return sentences.length > 0 ? { fileHash, sentences } : null;
        } catch {
            return null;
        }
    }

    private async resolveExternalReferenceTrack(
        videoPath: string,
        activePath: string,
    ): Promise<PreGenerationContext['externalReference']> {
        const candidates: string[] = [];
        if (activePath && !isAuthoritativeSubtitlePath(activePath) && MediaUtil.isSrt(activePath)) {
            candidates.push(activePath);
        }
        try {
            const folder = path.dirname(videoPath);
            const names = await this.fileSystemGateway.listFileNames(folder);
            const folderSrts = names
                .filter((name) => MediaUtil.isSrt(name))
                .map((name) => path.join(folder, name));
            for (const matched of MatchSrt.matchExactTracks(videoPath, folderSrts)) {
                if (!isAuthoritativeSubtitlePath(matched) && !candidates.includes(matched)) {
                    candidates.push(matched);
                }
            }
        } catch {
            // 仅保留 activePath 候选
        }

        let fallbackRef: PreGenerationContext['externalReference'] = null;
        for (const candidatePath of candidates) {
            try {
                if (!await this.fileSystemGateway.fileExists(candidatePath)) {
                    continue;
                }
                const raw = await this.fileSystemGateway.readTextFile(candidatePath);
                const lines = parseSrt(raw);
                if (lines.length === 0) {
                    continue;
                }
                const diag = inspectSubtitleTrackDiagnostics(raw, path.basename(candidatePath));
                const entry = { lines, origin: diag.origin };
                // 若遇到非自动字幕的作者/外部参考稿，优先拿它做对账；否则先暂存 auto_asr 兜底。
                if (diag.origin !== 'auto_asr') {
                    return entry;
                }
                fallbackRef ??= entry;
            } catch {
                // 跳过坏文件继续尝试下一个候选
            }
        }
        return fallbackRef;
    }

    /** 日志与进程检索键；每个任务唯一。 */
    private jobOf(taskId: number): string {
        return `subtitle-generation:${taskId}`;
    }

    /**
     * 任务主体：预读取参考轨 → 分片识别 → 音文对账 → 意群分句 → 资产迁移 → 落盘并挂载。
     */
    private async run(
        taskId: number,
        videoId: string,
        videoPath: string,
        srtPath: string,
        options?: SubtitleGenerationOptions,
    ): Promise<void> {
        const job = this.jobOf(taskId);
        let tempFolder: string | null = null;
        try {
            const preContext = await this.capturePreGenerationContext(
                videoId,
                videoPath,
                options?.sourceSubtitlePath,
            );

            const modelsRoot = await this.storageDirectoryProvider.provideDirectory(StorageDirectoryTarget.MODELS);
            const gateway = this.engineSelector.select();
            this.gatewayByTask.set(taskId, gateway);
            this.dpTaskService.registerTask(taskId, {
                cancel: () => {
                    this.cancelledTasks.add(taskId);
                    gateway.cancelActive(job);
                },
            });

            this.dpTaskService.process(taskId, {
                progress: '读取媒体时长…',
                progressMeta: { code: 'readingDuration' },
            });
            const duration = await this.ffmpegService.duration(videoPath);
            if (!Number.isFinite(duration) || duration <= 0) {
                throw new Error(`无法读取媒体时长：${duration}`);
            }

            const { ranges, cutPoints } = buildRecognitionChunkPlan(duration);

            this.dpTaskService.checkCancel(taskId);
            const tempRoot = await this.storageDirectoryProvider.provideDirectory(StorageDirectoryTarget.TEMP);
            tempFolder = path.join(tempRoot, 'subtitle-generation', String(taskId));
            const wavPaths = await this.ffmpegService.createRecognitionWavChunks({
                inputFile: videoPath,
                ranges,
                outputFolder: tempFolder,
                job,
                isCancelled: () => this.cancelledTasks.has(taskId),
                registerCancel: (cancel) => this.dpTaskService.registerTask(taskId, { cancel }),
            });

            const timelines: SpeechRecognitionToken[][] = [];
            for (let index = 0; index < wavPaths.length; index++) {
                this.dpTaskService.checkCancel(taskId);
                const percent = Math.floor((index / Math.max(wavPaths.length, 1)) * 100);
                this.dpTaskService.process(taskId, {
                    progress: `识别中 ${index + 1}/${wavPaths.length}（${percent}%）`,
                    progressMeta: {
                        code: 'transcribingChunk',
                        percent,
                        params: { current: index + 1, total: wavPaths.length },
                    },
                });
                const result = await gateway.transcribe({
                    audioPath: wavPaths[index],
                    modelsRoot,
                    job,
                    isCancelled: () => this.cancelledTasks.has(taskId),
                });
                const offset = ranges[index].start;
                timelines.push(result.tokens.map((token) => ({
                    ...token,
                    start: token.start + offset,
                    end: token.end === undefined ? undefined : token.end + offset,
                })));
            }

            this.dpTaskService.checkCancel(taskId);
            this.dpTaskService.process(taskId, {
                progress: '音文对账与断句整理…',
                progressMeta: { code: 'reconciling' },
            });

            const mergedTokens = this.segmenter.mergeTimelines(timelines, cutPoints);
            const asrWords = this.segmenter.createWords(mergedTokens);
            const reconciled = reconcileAudioAndTextSubtitles({
                asrWords,
                externalLines: preContext.externalReference?.lines ?? [],
                externalOrigin: preContext.externalReference?.origin,
            });
            const lines = this.segmenter.segmentWords(reconciled.words)
                .map((line, index) => ({ ...line, index: index + 1 }));
            if (lines.length === 0) {
                throw new Error('未识别到任何语音内容');
            }

            const newContent = toSrtContent(lines);
            await this.fileSystemGateway.writeTextFile(srtPath, newContent);

            if (this.assetMigrationService && preContext.migrationSource) {
                const newFileHash = ObjUtil.hash(newContent);
                try {
                    await this.assetMigrationService.migrateTrackAssets({
                        oldFileHash: preContext.migrationSource.fileHash,
                        oldSentences: preContext.migrationSource.sentences,
                        newFileHash,
                        newSentences: lines,
                    });
                } catch (migrationError) {
                    this.logger.warn('subtitle asset migration failed', {
                        job,
                        error: migrationError instanceof Error ? migrationError.message : String(migrationError),
                    });
                }
            }

            await this.watchHistoryService.attachSrt(videoPath, srtPath);

            if (options?.silent && this.rendererGateway) {
                try {
                    this.rendererGateway.fireAndForget('subtitle/track-refined', {
                        videoId,
                        subtitlePath: srtPath,
                    });
                } catch (notifyError) {
                    this.logger.warn('failed to notify renderer of refined track', {
                        job,
                        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
                    });
                }
            }

            this.logger.info('subtitle generated', {
                job,
                mode: reconciled.mode,
                coverage: Number(reconciled.coverage.toFixed(3)),
                rescuedProperNouns: reconciled.rescuedProperNounCount,
                lines: lines.length,
                srtPath,
            });
            this.dpTaskService.finish(taskId, {
                progress: '字幕生成完成',
                progressMeta: { code: 'done' },
                result: srtPath,
            });
        } catch (error) {
            if (error instanceof CancelByUserError) {
                this.dpTaskService.update({
                    id: taskId,
                    status: DpTaskState.CANCELLED,
                    progress: '任务取消',
                    progressMeta: { code: 'cancelled' },
                });
                return;
            }
            if (options?.silent) {
                // 静默后台精修失败时不锁死本会话，允许后续重试或再次进入时重检
                this.attemptedAutoRefine.delete(videoPath);
            }
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('subtitle generation failed', { job, error: message });
            this.dpTaskService.fail(taskId, {
                progress: '字幕生成失败',
                progressMeta: { code: 'failed' },
                result: message,
            });
        } finally {
            this.activeVideos.delete(videoPath);
            this.gatewayByTask.delete(taskId);
            this.cancelledTasks.delete(taskId);
            if (tempFolder) {
                try {
                    await this.fileSystemGateway.removeDirectoryIfExists(tempFolder);
                } catch (cleanupError) {
                    this.logger.warn('subtitle generation temp cleanup failed', { job, error: cleanupError });
                }
            }
        }
    }
}
