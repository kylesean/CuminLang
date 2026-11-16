import fs from 'node:fs/promises';
import path from 'node:path';
import { app, dialog } from 'electron';
import { z } from 'zod';
import { inject, injectable } from 'inversify';
import type Controller from '@/backend/controllers/Controller';
import registerRoute from '@/backend/controllers/ipc/registerRoute';
import { nonEmptyStringSchema } from '@/backend/controllers/ipc/routeSchemas';
import TYPES from '@/backend/ioc/types';
import type ContextStudioService from '@/backend/services/ContextStudioService';
import type {
    ExportReaderMarkdownInput,
    ExportReaderMarkdownResult,
} from '@/common/types/contextStudio';
const savedSentenceTagSchema = z.enum(['expression', 'pronunciation', 'grammar', 'general']);

/**
 * 语境工坊与精读文稿 IPC 控制器。
 */
@injectable()
export default class ContextStudioController implements Controller {
    constructor(
        @inject(TYPES.ContextStudioService) private readonly contextStudioService: ContextStudioService,
    ) {}

    public registerRoutes(): void {
        registerRoute('context-studio/save-sentence', (params) => this.contextStudioService.saveSentence(params), {
            schema: z.object({
                sentenceKey: nonEmptyStringSchema,
                videoId: z.string(),
                videoTitle: z.string().optional(),
                fileHash: nonEmptyStringSchema,
                sentenceIndex: z.number().int().min(0),
                startTime: z.number().min(0),
                endTime: z.number().min(0),
                text: nonEmptyStringSchema,
                textZh: z.string().optional(),
                note: z.string().optional(),
                tag: savedSentenceTagSchema.optional(),
            }),
            broadcastError: false,
        });

        registerRoute('context-studio/unsave-sentence', (params) => this.contextStudioService.unsaveSentence(params.sentenceKey), {
            schema: z.object({
                sentenceKey: nonEmptyStringSchema,
            }),
            broadcastError: false,
        });

        registerRoute('context-studio/list-saved-sentences', () => this.contextStudioService.listSavedSentences(), {
            broadcastError: false,
        });

        registerRoute('context-studio/list-saved-keys', (params) => this.contextStudioService.listSavedKeysByVideo(params.videoId), {
            schema: z.object({
                videoId: z.string(),
            }),
        });

        registerRoute('context-studio/update-saved-sentence', (params) => this.contextStudioService.updateSavedSentence(params), {
            schema: z.object({
                sentenceKey: nonEmptyStringSchema,
                note: z.string().optional(),
                tag: savedSentenceTagSchema.optional(),
            }),
            broadcastError: false,
        });

        registerRoute('context-studio/get-word-contexts', (params) => this.contextStudioService.getWordContexts(params.word), {
            schema: z.object({
                word: nonEmptyStringSchema,
            }),
            broadcastError: false,
        });

        registerRoute('context-studio/list-reader-documents', () => this.contextStudioService.listReaderDocuments(), {
            broadcastError: false,
        });

        registerRoute(
            'context-studio/export-reader-markdown',
            (params) => this.exportReaderMarkdown(params),
            {
                schema: z.object({
                    defaultFileName: nonEmptyStringSchema,
                    markdown: nonEmptyStringSchema,
                }),
                broadcastError: false,
            },
        );
    }

    /**
     * 打开桌面保存对话框，把当前精读讲义导出为 Markdown 文件。
     */
    private async exportReaderMarkdown(
        params: ExportReaderMarkdownInput,
    ): Promise<ExportReaderMarkdownResult> {
        const sanitized = params.defaultFileName
            .replace(/[<>:"/\\|?*]+/g, '-')
            .trim() || 'cuminlang-script-notes';
        const fileName = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`;
        const result = await dialog.showSaveDialog({
            title: '导出精读讲义',
            defaultPath: path.join(app.getPath('documents'), fileName),
            filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        try {
            await fs.writeFile(result.filePath, params.markdown, 'utf-8');
            return { success: true, path: result.filePath };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
