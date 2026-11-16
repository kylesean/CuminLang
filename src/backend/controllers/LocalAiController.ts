import { inject, injectable } from 'inversify';
import type Controller from '@/backend/controllers/Controller';
import registerRoute from '@/backend/controllers/ipc/registerRoute';
import type { LocalEmbeddingRuntime } from '@/backend/infrastructure/ai/LocalEmbeddingRuntime';
import TYPES from '@/backend/ioc/types';

/** 提供本地语义向量模型的设置页状态检查与安装控制。 */
@injectable()
export class LocalAiController implements Controller {
    public constructor(
        @inject(TYPES.LocalEmbeddingRuntime) private readonly embedding: LocalEmbeddingRuntime,
    ) {}

    /** 注册本地语义向量模型相关路由。 */
    public registerRoutes(): void {
        registerRoute('local-ai/embedding-status', () => this.embedding.getStatus());
        registerRoute('local-ai/embedding-download', () => this.embedding.download(), { broadcastError: false });
        registerRoute('local-ai/embedding-multimodal-download', () => this.embedding.downloadMultimodal(), { broadcastError: false });
        registerRoute('local-ai/embedding-cancel-download', async () => this.embedding.cancelDownload(), { broadcastError: false });
        registerRoute('local-ai/embedding-remove', () => this.embedding.remove(), { broadcastError: false });
    }
}
