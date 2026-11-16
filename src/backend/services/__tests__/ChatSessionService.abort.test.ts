import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-chat-abort-test',
        getVersion: () => '6.1.0',
    },
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createOpenAI } from '@ai-sdk/openai';
import { ChatSessionServiceImpl } from '@/backend/services/ChatSessionService';
import { InMemoryChatSessionStore } from '@/backend/services/chat/ChatSessionStore';
import type AiProviderService from '@/backend/services/AiProviderService';
import type LocalAiService from '@/backend/services/LocalAiService';
import type SentenceLearningService from '@/backend/services/SentenceLearningService';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type CacheService from '@/backend/services/CacheService';
import type { UIMessageChunk } from 'ai';

const makeChatSseResponse = (text: string) => {
    const chunk = {
        id: 'chatcmpl_x',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
    };
    const done = {
        id: 'chatcmpl_x',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
    return new Response(
        `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
};

describe('ChatSessionService 中止与关闭竞态', () => {
    it('在流尚未响应前调用 close(sessionId) 时，不向已关闭会话推送 error chunk', async () => {
        let abortSignalObserved: AbortSignal | undefined;
        const mockFetch: typeof fetch = (_input, init) => {
            abortSignalObserved = init?.signal ?? undefined;
            return new Promise<Response>((_resolve, reject) => {
                abortSignalObserved?.addEventListener('abort', () => {
                    reject(abortSignalObserved?.reason);
                }, { once: true });
            });
        };

        const chunks: Array<{ sessionId: string; chunk: UIMessageChunk }> = [];
        const rendererGateway = {
            fireAndForget: vi.fn((_event: string, payload: { sessionId: string; chunk: UIMessageChunk }) => {
                chunks.push(payload);
            }),
            call: vi.fn(),
        } as unknown as RendererGateway;

        const store = new InMemoryChatSessionStore();
        const session = store.create({
            videoId: 'v1',
            originalTopic: 'Yes.',
            paragraphLines: ['Yes.'],
            subtitleFileHash: 'h1',
            anchorSentenceIndex: 0,
        });
        const model = createOpenAI({
            baseURL: 'https://mock.abort.local/v1',
            apiKey: 'test-key',
            fetch: mockFetch,
        }).chat('gpt-4o');

        const service = new ChatSessionServiceImpl(
            { getModel: vi.fn().mockReturnValue(model) } as unknown as AiProviderService,
            {} as LocalAiService,
            {} as SentenceLearningService,
            rendererGateway,
            store,
            { get: vi.fn().mockReturnValue(null) } as unknown as CacheService,
        );

        await service.sendMessage({ sessionId: session.id, content: 'hello' });
        await vi.waitFor(() => expect(abortSignalObserved).toBeDefined());

        store.close(session.id);

        await vi.waitFor(() => expect(
            chunks.some((item) => item.chunk.type === 'abort' || item.chunk.type === 'error' || item.chunk.type === 'finish'),
        ).toBe(true));
        expect(chunks.some((item) => item.chunk.type === 'error')).toBe(false);
    });

    it('流刚输出 finish 后、落库前被 close(sessionId) 时，不抛 session closed 并误推 error chunk', async () => {
        const mockFetch: typeof fetch = async () => makeChatSseResponse('这是完整回复');

        const chunks: Array<{ sessionId: string; chunk: UIMessageChunk }> = [];
        const store = new InMemoryChatSessionStore();
        const session = store.create({
            videoId: 'v1',
            originalTopic: 'Yes.',
            paragraphLines: ['Yes.'],
            subtitleFileHash: 'h1',
            anchorSentenceIndex: 0,
        });
        const rendererGateway = {
            fireAndForget: vi.fn((_event: string, payload: { sessionId: string; chunk: UIMessageChunk }) => {
                chunks.push(payload);
                if (payload.chunk.type === 'finish') {
                    store.close(session.id);
                }
            }),
            call: vi.fn(),
        } as unknown as RendererGateway;

        const model = createOpenAI({
            baseURL: 'https://mock.abort.local/v1',
            apiKey: 'test-key',
            fetch: mockFetch,
        }).chat('gpt-4o');

        const service = new ChatSessionServiceImpl(
            { getModel: vi.fn().mockReturnValue(model) } as unknown as AiProviderService,
            {} as LocalAiService,
            {} as SentenceLearningService,
            rendererGateway,
            store,
            { get: vi.fn().mockReturnValue(null) } as unknown as CacheService,
        );

        await service.sendMessage({ sessionId: session.id, content: 'hello' });
        await vi.waitFor(() => expect(store.get(session.id).runs.size).toBe(0));

        expect(chunks.some((item) => item.chunk.type === 'error')).toBe(false);
    });
});
