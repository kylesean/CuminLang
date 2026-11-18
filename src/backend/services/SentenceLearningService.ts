import { inject, injectable } from 'inversify';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getMainLogger } from '@/backend/infrastructure/logger';
import TYPES from '@/backend/ioc/types';
import { CLOUD_AI_NOT_CONFIGURED_MESSAGE } from '@/common/constants/cloud-ai-errors';
import type AiProviderService from '@/backend/services/AiProviderService';
import type {
    CompleteSentenceParams,
    CompleteSentenceResult,
} from '@/common/types/chat';
import { WithRateLimit } from '@/backend/utils/concurrency/decorators';
import { buildCompleteSentencePrompt } from '@/backend/services/chat/ChatPromptBuilder';

/**
 * 完整句补全的结构化输出契约。
 */
const CompleteSentenceSchema = z.object({
    /** 给定字幕行本身是否已是一个完整句子。 */
    complete: z.boolean(),
    /** 完整句子原文；当前行已完整时与原行保持一致。 */
    sentence: z.string().min(1),
    /** 完整句的中文译文。 */
    translation: z.string().min(1),
});

export default interface SentenceLearningService {
    /**
     * 判断当前字幕行是否被换行截断，并尽力补全为完整句子。
     * 未配置可用 AI 模型时显式报错，不做静默回退。
     */
    completeSentence(params: CompleteSentenceParams): Promise<CompleteSentenceResult>;
    /**
     * 整句讲解当前是否可用：功能已启用且已配置整句讲解 AI 模型。
     */
    isLearningAvailable(): Promise<boolean>;
}

/**
 * 整句学习中不依赖会话的单次模型调用：字幕完整句补全与可用性探测。
 */
@injectable()
export class SentenceLearningServiceImpl implements SentenceLearningService {
    private logger = getMainLogger('SentenceLearningService');

    constructor(
        @inject(TYPES.AiProviderService) private readonly aiProviderService: AiProviderService,
    ) {}

    @WithRateLimit('gpt')
    public async completeSentence(params: CompleteSentenceParams): Promise<CompleteSentenceResult> {
        const model = this.aiProviderService.getModel('sentenceLearning');
        if (!model) {
            throw new Error(CLOUD_AI_NOT_CONFIGURED_MESSAGE);
        }
        const startedAt = Date.now();
        this.logger.info('complete sentence start', {
            textLength: params.text.length,
            precedingCount: params.precedingLines.length,
            followingCount: params.followingLines.length,
        });
        try {
            const result = await generateObject({
                model,
                schema: CompleteSentenceSchema,
                prompt: buildCompleteSentencePrompt(params),
                abortSignal: AbortSignal.timeout(60_000),
            });
            this.logger.info('complete sentence done', {
                durationMs: Date.now() - startedAt,
                complete: result.object.complete,
                sentenceLength: result.object.sentence.length,
            });
            return result.object;
        } catch (error) {
            // 结构化输出解析/校验失败时，NoObjectGeneratedError 携带模型原始返回文本，
            // 记进日志才能区分是模型输出格式问题还是接口问题。
            const noObjectError = error as { name?: string; message?: string; text?: unknown };
            this.logger.error('complete sentence failed', {
                durationMs: Date.now() - startedAt,
                errorName: noObjectError?.name,
                errorMessage: noObjectError?.message,
                rawText: typeof noObjectError?.text === 'string' ? noObjectError.text.slice(0, 500) : undefined,
            });
            throw error;
        }
    }

    /**
     * 已配置可用 AI 模型即返回 true；功能未启用或配置不可用时返回 false。
     */
    public async isLearningAvailable(): Promise<boolean> {
        try {
            return this.aiProviderService.getModel('sentenceLearning') !== null;
        } catch {
            return false;
        }
    }
}
