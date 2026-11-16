/**
 * 随包分发的 llama.cpp 运行时版本（供本地语义向量运行时使用）。
 *
 * EmbeddingGemma 2 的 `gemma-embedding2` 架构需要 b11500+。
 * 升级版本时同步更新 `scripts/download.mjs` 的资源名与 SHA-256。
 */
export const LLAMA_RUNTIME_VERSION = 'b12292';

/** 本地模型完整性校验标记后缀。 */
export const LOCAL_AI_INTEGRITY_MARKER_SUFFIX = '.sha256.ok';

import type { CommonDownloadPhase } from '@/common/contracts/model-download-phase';

/** 语义向量模型安装与下载状态。 */
export interface LocalEmbeddingStatus {
    /** 基础文本语义模型是否就绪。 */
    ready: boolean;
    /** 展示名。 */
    name: string;
    /** 展示用大小标签。 */
    sizeLabel: string;
    /** 基础模型精确字节数。 */
    bytes: number;
    /** 多模态投影是否就绪；未安装时图像/音频向量不可用。 */
    multimodalReady: boolean;
    /** 多模态投影体积（字节）。 */
    multimodalBytes: number;
    /** 任一项是否正在下载。 */
    downloading?: boolean;
    /** 当前正在下载的对象。 */
    activeTarget?: 'base' | 'multimodal' | null;
    /** 当前阶段。 */
    phase?: CommonDownloadPhase;
    /** 当前已下载字节数。 */
    downloaded?: number;
    /** 当前下载目标总字节数。 */
    total?: number;
    /** 最近一次下载错误信息；无记录为 null。 */
    error?: string | null;
    /** 基础模型候选下载地址（含镜像）。 */
    downloadUrls?: string[];
    /** 基础模型本地安装路径。 */
    modelPath?: string;
    /** 多模态投影候选下载地址（含镜像）。 */
    multimodalDownloadUrls?: string[];
    /** 多模态投影本地安装路径。 */
    multimodalModelPath?: string;
}

/** 本地模型资源项（用于本地语义向量模型与多模态投影文件下载）。 */
export interface LocalAiModelDefinition {
    /** 稳定模型标识。 */
    id: string;
    /** 展示名。 */
    name: string;
    /** 模型 GGUF 文件名。 */
    file: string;
    /** 精确字节数，用于续传范围与完整性校验。 */
    bytes: number;
    /** 展示用大小标签。 */
    sizeLabel: string;
    /** 有序候选下载地址：声明顺序即优先级，首个为优先源（国内镜像），其余为备用源。 */
    urls: readonly string[];
    /** 固定版本的 SHA256。 */
    sha256: string;
    /** 模型来源标识。 */
    source: 'catalog';
}

/**
 * 可选的本地语义向量模型。
 *
 * 只服务于内容推荐的语义相似度；未安装时推荐自动降级为云端向量或词面相似度。
 */
export const LOCAL_EMBEDDING_MODEL: LocalAiModelDefinition = {
    id: 'embeddinggemma-2-q4_k_xl',
    name: 'EmbeddingGemma 2 Q4_K_XL',
    file: 'embeddinggemma-2-UD-Q4_K_XL.gguf',
    bytes: 175673856,
    sizeLabel: '168 MB',
    urls: [
        'https://www.modelscope.cn/models/unsloth/embeddinggemma-2-GGUF/resolve/master/embeddinggemma-2-UD-Q4_K_XL.gguf',
        'https://hf-mirror.com/unsloth/embeddinggemma-2-GGUF/resolve/main/embeddinggemma-2-UD-Q4_K_XL.gguf',
        'https://huggingface.co/unsloth/embeddinggemma-2-GGUF/resolve/main/embeddinggemma-2-UD-Q4_K_XL.gguf',
    ],
    sha256: 'ea905fd08e8061db77a0031cbb5096d459d7cfd2bdd0ad2ba66e483f16719493',
    source: 'catalog',
};

/**
 * EmbeddingGemma 2 的多模态投影文件。
 *
 * 只有需要图像/音频向量时才安装：文本推荐不依赖它。单独成项而不是塞进
 * `LOCAL_EMBEDDING_MODEL`，是为了让只做文本语义的安装保持 168 MB 而不是 700 MB。
 */
export const LOCAL_EMBEDDING_MMPROJ: LocalAiModelDefinition = {
    id: 'embeddinggemma-2-mmproj-q8_0',
    name: 'EmbeddingGemma 2 MMProj Q8_0',
    file: 'embeddinggemma-2-mmproj-Q8_0.gguf',
    bytes: 554821120,
    sizeLabel: '529 MB',
    urls: [
        'https://www.modelscope.cn/models/unsloth/embeddinggemma-2-GGUF/resolve/master/mmproj-Q8_0.gguf',
        'https://hf-mirror.com/unsloth/embeddinggemma-2-GGUF/resolve/main/mmproj-Q8_0.gguf',
        'https://huggingface.co/unsloth/embeddinggemma-2-GGUF/resolve/main/mmproj-Q8_0.gguf',
    ],
    sha256: '90e7b0238009e2954f856f2081dcf7f35af026b64c765e98f4777053e1754460',
    source: 'catalog',
};

/** 向量维度；EmbeddingGemma 2 固定 768 维，用于拒绝异常响应。 */
export const LOCAL_EMBEDDING_DIMENSION = 768;
