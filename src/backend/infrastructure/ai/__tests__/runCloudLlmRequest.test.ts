import { describe, expect, it, vi } from 'vitest';

import { isRateLimitError, runCloudLlmRequest } from '@/backend/infrastructure/ai/runCloudLlmRequest';

describe('runCloudLlmRequest', () => {
    it('限制同时在途的最大并发数为 2，多出的请求排队依次放行', async () => {
        let active = 0;
        let maxObserved = 0;
        const resolvers: Array<() => void> = [];

        const launch = () =>
            runCloudLlmRequest(
                () =>
                    new Promise<void>((resolve) => {
                        active += 1;
                        maxObserved = Math.max(maxObserved, active);
                        resolvers.push(() => {
                            active -= 1;
                            resolve();
                        });
                    }),
                { retryOnRateLimit: false },
            );

        const p1 = launch();
        const p2 = launch();
        const p3 = launch();
        const p4 = launch();

        await vi.waitFor(() => expect(resolvers).toHaveLength(2));
        expect(maxObserved).toBe(2);
        expect(active).toBe(2);

        resolvers.shift()?.();
        await vi.waitFor(() => expect(resolvers).toHaveLength(2));
        expect(maxObserved).toBe(2);

        resolvers.shift()?.();
        await vi.waitFor(() => expect(resolvers).toHaveLength(2));
        expect(maxObserved).toBe(2);

        while (resolvers.length > 0) {
            resolvers.shift()?.();
        }
        await Promise.all([p1, p2, p3, p4]);
        expect(active).toBe(0);
    });

    it('遇到 429 / in-flight 限流报错时退避重试一次，普通错误不重试', async () => {
        vi.useFakeTimers();
        try {
            let attempts = 0;
            const rateLimitedPromise = runCloudLlmRequest(
                async () => {
                    attempts += 1;
                    if (attempts === 1) {
                        throw Object.assign(new Error('At most 2 requests may be in flight per client IP.'), {
                            statusCode: 429,
                        });
                    }
                    return 'ok';
                },
                { retryDelayMs: 500 },
            );

            await vi.advanceTimersByTimeAsync(500);
            await expect(rateLimitedPromise).resolves.toBe('ok');
            expect(attempts).toBe(2);

            let normalAttempts = 0;
            await expect(
                runCloudLlmRequest(async () => {
                    normalAttempts += 1;
                    throw new Error('network down');
                }),
            ).rejects.toThrow('network down');
            expect(normalAttempts).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('识别多种限流错误形态', () => {
        expect(isRateLimitError({ statusCode: 429, message: 'slow down' })).toBe(true);
        expect(isRateLimitError(new Error('At most 2 requests may be in flight per client IP.'))).toBe(true);
        expect(isRateLimitError(new Error('Rate limit exceeded (18 RPM)'))).toBe(true);
        expect(isRateLimitError(new Error('Invalid API key'))).toBe(false);
    });
});
