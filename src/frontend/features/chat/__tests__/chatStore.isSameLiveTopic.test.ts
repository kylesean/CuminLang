import { beforeEach, describe, expect, it, vi } from 'vitest';

// chatStore 拖带的依赖面很大，这里只替身它真正触达的部分：
// usePlayer（当前句/句子表/暂停）、playbackSessionStore（videoId）、chatApi、视图同步与音频。
const { playerState, playbackState } = vi.hoisted(() => ({
    playerState: {
        currentSentence: null as { text: string; index: number; fileHash: string; start?: number; end?: number; textZH?: string } | null,
        sentences: [] as { text: string; index: number; fileHash: string; start?: number; end?: number; textZH?: string }[],
    },
    playbackState: {
        videoId: 'video-a' as string | null,
    },
}));

vi.mock('@/frontend/features/player/playerStore', () => ({
    usePlayer: {
        getState: () => ({
            currentSentence: playerState.currentSentence,
            sentences: playerState.sentences,
            pause: () => {},
        }),
    },
}));

vi.mock('@/frontend/features/player/playbackSessionStore', () => ({
    usePlaybackSession: {
        getState: () => playbackState,
    },
}));

vi.mock('@/frontend/features/chat/chatApi', () => ({
    chatApi: {
        learningAvailable: vi.fn().mockResolvedValue(false),
        completeSentence: vi.fn(),
        closeSession: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn(),
        saveStudyNote: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/frontend/features/player/lib/player-view-sync', () => ({
    beginOverlayView: vi.fn(),
}));

vi.mock('@/frontend/infrastructure/audio/AudioPlayer', () => ({
    getTtsUrl: vi.fn(),
    playAudioUrl: vi.fn(),
}));

vi.mock('@/frontend/log/simple-logger', () => ({
    getRendererLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { chatApi } from '@/frontend/features/chat/chatApi';
import useChatPanel from '../chatStore';

/** 把会话面板摆到「视频 A 第 0 行已有存活会话」的基线。 */
const seedSession = (fileHash: string): void => {
    useChatPanel.setState({
        chatSessionId: 'sess-a',
        topicKey: 'Yes.',
        anchorIndex: 0,
        anchorFileHash: fileHash,
        hasLearningContext: true,
        learningVisible: false,
    });
};

describe('chatStore 同句判重的跨视频边界', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(chatApi.createSession).mockReset();
        playbackState.videoId = 'video-a';
        playerState.sentences = [];
        useChatPanel.setState({ chatSessionId: '', topicKey: null, anchorIndex: null, anchorFileHash: null });
    });

    it('同一视频同一句：沿用现有会话，不重建', async () => {
        seedSession('hash-a');
        playerState.currentSentence = { text: 'Yes.', index: 0, fileHash: 'hash-a' };

        await useChatPanel.getState().createFromCurrent();

        expect(chatApi.createSession).not.toHaveBeenCalled();
        expect(chatApi.closeSession).not.toHaveBeenCalled();
        expect(useChatPanel.getState().chatSessionId).toBe('sess-a');
        expect(useChatPanel.getState().learningVisible).toBe(true);
    });

    it('不同视频相同文本相同索引：不认作同一句，关闭旧会话并重建', async () => {
        seedSession('hash-a');
        // 视频第 0 行的常见短句完全可能撞车：文本与索引一致，字幕文件不同
        playerState.currentSentence = { text: 'Yes.', index: 0, fileHash: 'hash-b' };
        vi.mocked(chatApi.createSession).mockResolvedValue({ sessionId: 'sess-b' } as never);

        await useChatPanel.getState().createFromCurrent();

        expect(chatApi.closeSession).toHaveBeenCalledWith('sess-a');
        expect(chatApi.createSession).toHaveBeenCalledTimes(1);
        expect(useChatPanel.getState().chatSessionId).toBe('sess-b');
        expect(useChatPanel.getState().anchorFileHash).toBe('hash-b');
    });

    it('快速连续 openSentenceSession 切换句子时新目标抢占旧请求，不丢弃最后目标', async () => {
        let resolveFirst!: (val: { sessionId: string }) => void;
        let callIdx = 0;
        vi.mocked(chatApi.createSession).mockImplementation(() => {
            callIdx += 1;
            if (callIdx === 1) {
                return new Promise((resolve) => {
                    resolveFirst = resolve as (val: { sessionId: string }) => void;
                });
            }
            return Promise.resolve({ sessionId: 'sess-second' } as never);
        });

        const first = useChatPanel.getState().openSentenceSession({ text: 'First', index: 0, fileHash: 'h1', start: 0, end: 1 } as never);
        await vi.waitFor(() => expect(chatApi.createSession).toHaveBeenCalledTimes(1));

        const second = useChatPanel.getState().openSentenceSession({ text: 'Second', index: 1, fileHash: 'h1', start: 1, end: 2 } as never);
        await second;

        resolveFirst({ sessionId: 'sess-first' });
        await first;

        expect(chatApi.closeSession).toHaveBeenCalledWith('sess-first');
        expect(useChatPanel.getState().chatSessionId).toBe('sess-second');
        expect(useChatPanel.getState().anchorIndex).toBe(1);
    });

    it('openSentenceSession 将跨行碎片合并为完整意群，stepSentence 按合并块步进', async () => {
        playerState.sentences = [
            { text: 'What would that', textZH: '那会是', index: 0, fileHash: 'h1', start: 0, end: 1.2 },
            { text: 'one thing be?', textZH: '哪一件事？', index: 1, fileHash: 'h1', start: 1.3, end: 2.5 },
            { text: 'Probably patience.', textZH: '大概是耐心。', index: 2, fileHash: 'h1', start: 2.7, end: 4.0 },
        ];
        vi.mocked(chatApi.createSession)
            .mockResolvedValueOnce({ sessionId: 'sess-block-1' })
            .mockResolvedValueOnce({ sessionId: 'sess-block-2' });

        await useChatPanel.getState().openSentenceSession(playerState.sentences[1] as never);
        expect(useChatPanel.getState().anchorIndex).toBe(0);
        expect(useChatPanel.getState().topicText).toBe('What would that one thing be?');
        expect(useChatPanel.getState().topicTranslation).toBe('那会是 哪一件事？');

        await useChatPanel.getState().stepSentence(1);
        expect(useChatPanel.getState().anchorIndex).toBe(2);
        expect(useChatPanel.getState().topicText).toBe('Probably patience.');
        expect(useChatPanel.getState().chatSessionId).toBe('sess-block-2');
    });

    it('resetConversationView 会关闭旧会话、清空已持久化消息并重建干净会话', async () => {
        playerState.sentences = [
            { text: 'Hello world.', textZH: '你好。', index: 0, fileHash: 'h1', start: 0, end: 1.5 },
        ];
        vi.mocked(chatApi.createSession)
            .mockResolvedValueOnce({ sessionId: 'sess-old' })
            .mockResolvedValueOnce({ sessionId: 'sess-fresh' });

        await useChatPanel.getState().openSentenceSession(playerState.sentences[0] as never);
        const epochBeforeReset = useChatPanel.getState().conversationEpoch;

        useChatPanel.getState().resetConversationView();

        expect(useChatPanel.getState().chatSessionId).toBe('');
        expect(useChatPanel.getState().restoredMessages).toEqual([]);
        expect(useChatPanel.getState().conversationEpoch).toBe(epochBeforeReset + 1);
        expect(chatApi.closeSession).toHaveBeenCalledWith('sess-old');
        expect(chatApi.saveStudyNote).toHaveBeenCalledWith(expect.objectContaining({
            sentenceKey: 'h1:0',
            messages: [],
        }));
        expect(chatApi.createSession).toHaveBeenLastCalledWith(expect.objectContaining({
            sentenceKey: 'h1:0',
            restoredMessages: [],
        }));

        await vi.waitFor(() => {
            expect(useChatPanel.getState().chatSessionId).toBe('sess-fresh');
        });
    });

    it('resetConversationView 重建会话失败时写入错误态，不永久停留在 resolving', async () => {
        playerState.sentences = [
            { text: 'Hello world.', textZH: '你好。', index: 0, fileHash: 'h1', start: 0, end: 1.5 },
        ];
        vi.mocked(chatApi.createSession)
            .mockResolvedValueOnce({ sessionId: 'sess-old' })
            .mockRejectedValueOnce(new Error('network unavailable'));

        await useChatPanel.getState().openSentenceSession(playerState.sentences[0] as never);
        useChatPanel.getState().resetConversationView();

        await vi.waitFor(() => {
            expect(useChatPanel.getState().sentenceResolveError).toBe('network unavailable');
        });
        expect(useChatPanel.getState().chatSessionId).toBe('');
    });
});
