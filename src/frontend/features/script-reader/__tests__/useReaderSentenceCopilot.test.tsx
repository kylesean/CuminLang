import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReaderSentenceCopilot } from '../hooks/useReaderSentenceCopilot';
import { chatApi } from '@/frontend/features/chat/chatApi';
import type { Sentence } from '@/common/types/SentenceC';

vi.mock('@/frontend/features/chat/chatApi', () => ({
    chatApi: {
        learningAvailable: vi.fn(async () => true),
        getStudyNote: vi.fn(),
        createSession: vi.fn(),
        closeSession: vi.fn(async () => undefined),
        sendMessageStream: vi.fn(),
    },
}));

vi.mock('@/frontend/features/chat/useWhisperDictation', () => ({
    useWhisperDictation: () => ({
        status: 'idle',
        toggle: vi.fn(),
        cancel: vi.fn(),
    }),
}));

const sampleSentence: Sentence = {
    fileHash: 'hash-copilot',
    index: 3,
    start: 10,
    end: 14,
    adjustedStart: null,
    adjustedEnd: null,
    text: 'Stay curious and keep building.',
    textZH: '保持好奇，继续创造。',
    key: 'k-3',
    transGroup: 1,
    translationKey: 'hash-copilot:3',
    struct: { original: '', blocks: [] },
};

describe('useReaderSentenceCopilot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('在 useChat 从 reader-inactive-chat 切换到真实 sessionId 后仍保留恢复的历史消息', async () => {
        vi.mocked(chatApi.getStudyNote).mockResolvedValue({
            messages: [
                { id: 'm1', role: 'user', blocks: [{ kind: 'text', text: '这句话里的 keep building 是什么用法？' }] },
                { id: 'm2', role: 'assistant', blocks: [{ kind: 'text', text: 'keep + doing 表示持续做某事。' }] },
            ],
        } as never);
        vi.mocked(chatApi.createSession).mockResolvedValue({ sessionId: 'sess-restored-1' } as never);

        const { result, unmount } = renderHook(() => useReaderSentenceCopilot({
            videoId: 'vid-1',
            activeSentence: sampleSentence,
            focusedText: sampleSentence.text,
            allSentences: [sampleSentence],
        }));

        await waitFor(() => {
            expect(result.current.sessionReady).toBe(true);
            expect(result.current.messageViews).toHaveLength(2);
        });

        expect(JSON.stringify(result.current.messageViews[0])).toContain('keep building');
        expect(JSON.stringify(result.current.messageViews[1])).toContain('keep + doing');
        unmount();
    });

    it('clearConversation 清空界面对话的同时关闭旧后端会话并重建空历史会话', async () => {
        vi.mocked(chatApi.getStudyNote).mockResolvedValue({
            messages: [
                { id: 'm1', role: 'user', blocks: [{ kind: 'text', text: '旧问题' }] },
                { id: 'm2', role: 'assistant', blocks: [{ kind: 'text', text: '旧回答' }] },
            ],
        } as never);
        vi.mocked(chatApi.createSession)
            .mockResolvedValueOnce({ sessionId: 'sess-old' } as never)
            .mockResolvedValueOnce({ sessionId: 'sess-fresh' } as never);
        const saveStudyNoteSpy = vi.fn(async () => ({}));
        Object.assign(chatApi, { saveStudyNote: saveStudyNoteSpy });

        const { result, unmount } = renderHook(() => useReaderSentenceCopilot({
            videoId: 'vid-1',
            activeSentence: sampleSentence,
            focusedText: sampleSentence.text,
            allSentences: [sampleSentence],
        }));

        await waitFor(() => {
            expect(result.current.sessionReady).toBe(true);
            expect(result.current.messageViews).toHaveLength(2);
        });

        result.current.clearConversation();

        await waitFor(() => {
            expect(result.current.messageViews).toHaveLength(0);
            expect(chatApi.closeSession).toHaveBeenCalledWith('sess-old');
            expect(chatApi.createSession).toHaveBeenCalledTimes(2);
        });

        expect(saveStudyNoteSpy).toHaveBeenCalledWith(expect.objectContaining({
            messages: [],
        }));
        expect(vi.mocked(chatApi.createSession).mock.calls[1]?.[0]).toMatchObject({
            restoredMessages: [],
        });
        unmount();
    });
});
