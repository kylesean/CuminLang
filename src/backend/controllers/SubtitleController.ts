import { z } from 'zod';
import registerRoute from '@/backend/controllers/ipc/registerRoute';
import { finiteNonNegativeNumberSchema, nonEmptyStringSchema } from '@/backend/controllers/ipc/routeSchemas';
import type {
    DiscardEditedSubtitleRequest,
    DiscardEditedSubtitleResponse,
    SaveEditedSubtitleRequest,
    SaveEditedSubtitleResponse,
} from '@/common/contracts/subtitle-edit';
import type { SrtSentence } from '@/common/types/SentenceC';
import type { SentenceStruct } from '@/common/types/SentenceStruct';
import { inject, injectable, optional } from 'inversify';
import TYPES from '@/backend/ioc/types';
import type Controller from '@/backend/controllers/Controller';
import type SubtitleService from '@/backend/services/SubtitleService';
import { type SubtitleVocabularyMatchResult } from '@/backend/services/SubtitleService';
import type SubtitleComprehensionService from '@/backend/services/SubtitleComprehensionService';
import type {
    DocumentDifficultWordsParams,
    SubtitleComprehensionParams,
} from '@/common/types/subtitleComprehension';
import type SceneIndexService from '@/backend/services/SceneIndexService';
import type WatchHistoryService from '@/backend/services/WatchHistoryService';
import type { SceneBoundary, SceneSentence } from '@/common/learning/sceneSegmentation';


/**
 * 字幕解析与生词匹配 IPC 控制器。
 */
@injectable()
export default class SubtitleController implements Controller {
    /**
     * 构造字幕控制器。
     *
     * @param subtitleService 字幕业务服务。
     * @param subtitleComprehensionService 句子理解度服务。
     */
    constructor(
        @inject(TYPES.SubtitleService) private readonly subtitleService: SubtitleService,
        @inject(TYPES.SubtitleComprehensionService)
        private readonly subtitleComprehensionService: SubtitleComprehensionService,
        @inject(TYPES.SceneIndexService)
        private readonly sceneIndexService: SceneIndexService,
        @optional() @inject(TYPES.WatchHistoryService)
        private readonly watchHistoryService?: WatchHistoryService,
    ) {}

    /**
     * 为当前播放会话解析字幕。
     *
     * @param params 字幕路径、视频 ID 和字幕加载会话 ID。
     * @returns 已结构化的字幕；会话过期或没有字幕时返回 `null`。
     */
    public async parseSrt(params: {
        subtitlePath: string | null;
        videoId: string;
        playbackSessionId: string;
    }): Promise<SrtSentence | null> {
        return this.subtitleService.parseSrtForPlayback(
            params.subtitlePath,
            params.videoId,
            params.playbackSessionId,
        );
    }

    /**
     * 匹配已解析字幕中出现的用户生词。
     *
     * @param params 字幕哈希、视频 ID 和字幕加载会话 ID。
     * @returns 带字幕哈希的生词匹配结果。
     */
    public async matchVocabulary(params: {
        fileHash: string;
        videoId: string;
        playbackSessionId: string;
    }): Promise<SubtitleVocabularyMatchResult> {
        return this.subtitleService.matchVocabulary(
            params.fileHash,
            params.videoId,
            params.playbackSessionId,
        );
    }

    /**
     * 将任意英文文本解析为前端展示结构。
     *
     * @param texts 待解析文本数组。
     * @returns 与入参顺序一一对应的结构化句子。
     */
    public async parseStructs(texts: string[]): Promise<SentenceStruct[]> {
        return this.subtitleService.parseStructs(texts);
    }

    /**
     * 估算一句话的直接理解概率，用于自适应中文字幕。
     *
     * @param params 句子文本与可选播放定位。
     * @returns 本地可解释的理解度快照。
     */
    public async buildComprehension(params: SubtitleComprehensionParams) {
        return this.subtitleComprehensionService.build(params);
    }

    /**
     * 扫描整篇文稿中达到考纲/进阶难度的候选词，解决冷启动下筛选为空的问题。
     */
    public async extractDocumentDifficultWords(params: DocumentDifficultWordsParams) {
        return this.subtitleComprehensionService.extractDocumentDifficultWords(params);
    }

    /**
     * 读取或计算字幕的场景边界。
     *
     * 切分是纯本地的确定性启发式，后端缓存结果，前端不必每次进入播放页都
     * 重新遍历整份字幕。
     *
     * @param params 参与切分的字幕句（只需影响边界的字段）。
     * @returns 场景边界列表。
     */
    public async getSceneBoundaries(params: {
        sentences: SceneSentence[];
        videoPath?: string;
    }): Promise<SceneBoundary[]> {
        return this.sceneIndexService.getBoundaries(params.sentences, params.videoPath);
    }

    /**
     * 将右侧文稿原地编辑结果落盘到 L3 `.edited.srt`，绑定播放记录并返回最新结构化字幕。
     */
    public async saveEdited(params: SaveEditedSubtitleRequest): Promise<SaveEditedSubtitleResponse> {
        const videoPath = await this.resolveVideoPath(params.videoId, params.videoPath);
        const srt = await this.subtitleService.saveEditedTrack({
            videoPath,
            sourceSubtitlePath: params.sourceSubtitlePath,
            oldFileHash: params.oldFileHash,
            lines: params.lines,
        });
        return this.attachAndResolveTrack(params.videoId, videoPath, srt);
    }

    /**
     * 放弃 L3 `.edited.srt` 修订，将学习资产迁回基线轨、绑定播放记录并返回最新结构化字幕。
     */
    public async discardEdited(params: DiscardEditedSubtitleRequest): Promise<DiscardEditedSubtitleResponse> {
        const videoPath = await this.resolveVideoPath(params.videoId, params.videoPath);
        const srt = await this.subtitleService.discardEditedTrack({
            videoPath,
            targetSubtitlePath: params.targetSubtitlePath,
            currentFileHash: params.currentFileHash,
        });
        return this.attachAndResolveTrack(params.videoId, videoPath, srt);
    }

    private async resolveVideoPath(videoId: string, provided?: string): Promise<string | undefined> {
        // 服务端始终以 videoId 对应的数据库记录为权威路径，不盲信 IPC 入参，防止跨路径读写/删盘。
        if (this.watchHistoryService) {
            const resolved = await this.watchHistoryService.videoPath(videoId).catch(() => undefined);
            if (!resolved) {
                throw new Error(`找不到对应的视频记录：${videoId}`);
            }
            return resolved;
        }
        return provided;
    }

    private async attachAndResolveTrack(
        videoId: string,
        videoPath: string | undefined,
        srt: SrtSentence,
    ): Promise<SaveEditedSubtitleResponse> {
        if (videoPath && this.watchHistoryService) {
            await this.watchHistoryService.attachSrt(videoPath, srt.filePath);
        }
        const resolution = this.watchHistoryService
            ? await this.watchHistoryService.playerSubtitle(videoId).catch(() => null)
            : null;
        return { srt, resolution };
    }

    /**
     * 注册字幕相关 IPC 路由。
     */
    registerRoutes(): void {
        registerRoute('subtitle/srt/parse-to-sentences', (p) => this.parseSrt(p), {
            schema: z.object({
                subtitlePath: z.string().nullable(),
                videoId: nonEmptyStringSchema,
                playbackSessionId: nonEmptyStringSchema,
            }),
        });
        registerRoute('subtitle/srt/match-vocabulary', (p) => this.matchVocabulary(p), {
            schema: z.object({
                fileHash: nonEmptyStringSchema,
                videoId: nonEmptyStringSchema,
                playbackSessionId: nonEmptyStringSchema,
            }),
        });
        registerRoute('subtitle/text/parse-structs', (p) => this.parseStructs(p), {
            schema: z.array(z.string()),
        });
        registerRoute('subtitle/comprehension', (p) => this.buildComprehension(p), {
            schema: z.object({
                text: z.string().min(1).max(2000),
                fileHash: z.string().min(1).optional(),
                sentenceIndex: z.number().int().nonnegative().optional(),
            }),
        });
        registerRoute('subtitle/document-difficult-words', (p) => this.extractDocumentDifficultWords(p), {
            schema: z.object({
                texts: z.array(z.string()).max(20000),
            }),
        });
        registerRoute('subtitle/scene-boundaries', (p) => this.getSceneBoundaries(p), {
            schema: z.object({
                sentences: z.array(z.object({
                    fileHash: z.string().min(1),
                    index: z.number().int().nonnegative(),
                    start: z.number(),
                    end: z.number(),
                    text: z.string(),
                })).min(2).max(20000),
                // 可选：提供时后端会用真实声纹替代文本推测；缺省时退回纯文本启发式。
                videoPath: z.string().min(1).optional(),
            }),
        });
        registerRoute('subtitle/srt/save-edited', (p) => this.saveEdited(p), {
            schema: z.object({
                videoId: nonEmptyStringSchema,
                videoPath: z.string().min(1).optional(),
                sourceSubtitlePath: z.string().min(1).optional(),
                oldFileHash: z.string().min(1).optional(),
                lines: z.array(z.object({
                    start: finiteNonNegativeNumberSchema,
                    end: finiteNonNegativeNumberSchema,
                    contentEn: z.string().trim().min(1),
                    contentZh: z.string().optional(),
                })).min(1).max(20000),
            }),
        });
        registerRoute('subtitle/srt/discard-edited', (p) => this.discardEdited(p), {
            schema: z.object({
                videoId: nonEmptyStringSchema,
                videoPath: z.string().min(1).optional(),
                editedSubtitlePath: z.string().min(1).optional(),
                targetSubtitlePath: nonEmptyStringSchema,
                currentFileHash: z.string().min(1).optional(),
            }),
        });
    }
}
