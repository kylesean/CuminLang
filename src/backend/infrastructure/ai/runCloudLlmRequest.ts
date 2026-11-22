import { setTimeout as delay } from 'node:timers/promises';

import { concurrency } from '@/backend/utils/concurrency';

const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 2_000;

/**
 * 识别上游模型接口返回的限流 / 在途并发超限错误（HTTP 429 或典型提示）。
 */
export function isRateLimitError(error: unknown): boolean {
    const visited = new Set<unknown>();
    let current: unknown = error;
    while (current && !visited.has(current)) {
        visited.add(current);
        if (typeof current === 'string') {
            if (/too many requests|rate[- ]?limit|in[- ]?flight|rpm\b|requests per/i.test(current)) {
                return true;
            }
            break;
        }
        if (typeof current !== 'object') {
            break;
        }
        const record = current as {
            status?: unknown;
            statusCode?: unknown;
            message?: unknown;
            responseBody?: unknown;
            cause?: unknown;
        };
        if (record.status === 429 || record.statusCode === 429) {
            return true;
        }
        for (const text of [record.message, record.responseBody]) {
            if (typeof text === 'string'
                && /too many requests|rate[- ]?limit|in[- ]?flight|rpm\b|requests per|\b429\b/i.test(text)) {
                return true;
            }
        }
        current = record.cause;
    }
    return false;
}

export interface RunCloudLlmOptions {
    /** 外部取消信号：排队等待或限流退避期间被中止时立即退出。 */
    signal?: AbortSignal;
    /** 排队等待最长耗时（毫秒）。 */
    timeoutMs?: number;
    /** 遇到 429 / 并发超限时是否做一次短退避重试；默认 true。 */
    retryOnRateLimit?: boolean;
    /** 自定义能否重试断言（如流式输出尚未向前端推送过内容时才允许重试）。 */
    canRetry?: () => boolean;
    /** 限流退避时长（毫秒），默认 2000ms。 */
    retryDelayMs?: number;
}

/**
 * 所有云端 LLM 调用共用的并发与速率保护入口。
 *
 * 先过防突发速率窗口（`rateLimiter.gpt`），放行后再占最大在途信号量（`semaphore.gpt`），
 * 防止排队期间白占并发槽位；遇到偶发 429 / 在途超限时释放槽位做短退避并重试一次，
 * 若仍失败则直接向上透传原始报错。
 */
export async function runCloudLlmRequest<T>(
    task: (attempt: number) => Promise<T>,
    options: RunCloudLlmOptions = {},
): Promise<T> {
    const retryEnabled = options.retryOnRateLimit ?? true;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RATE_LIMIT_RETRY_DELAY_MS;

    const executeOnce = (attempt: number): Promise<T> =>
        concurrency.withRateLimit(
            'gpt',
            () => concurrency.withSemaphore('gpt', () => task(attempt), {
                signal: options.signal,
                timeoutMs: options.timeoutMs,
            }),
            {
                signal: options.signal,
                timeoutMs: options.timeoutMs,
            },
        );

    try {
        return await executeOnce(0);
    } catch (error) {
        const shouldRetry = retryEnabled
            && !options.signal?.aborted
            && (options.canRetry ? options.canRetry() : true)
            && isRateLimitError(error);
        if (!shouldRetry) {
            throw error;
        }
        await delay(retryDelayMs, undefined, { signal: options.signal });
        return await executeOnce(1);
    }
}
