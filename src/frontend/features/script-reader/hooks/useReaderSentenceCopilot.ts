import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { buildSentenceStudyKey } from '@/common/types/chat';
import type { Sentence } from '@/common/types/SentenceC';
import { chatApi } from '@/frontend/features/chat/chatApi';
import { ElectronChatTransport } from '@/frontend/features/chat/chatTransport';
import { persistedToUiMessages, toMessageViews } from '@/frontend/features/chat/useSentenceLearningChat';
import { useWhisperDictation } from '@/frontend/features/chat/useWhisperDictation';

interface UseReaderSentenceCopilotParams {
    videoId?: string;
    activeSentence: Sentence | null;
    /** 若当前聚焦单元跨越多个 SRT cue，传入合并后的完整句供 AI 精读使用。 */
    focusedText?: string;
    allSentences: readonly Sentence[];
}

/**
 * 精读文稿右侧案头专属的「按需 AI 精读搭档」Hook：
 * - 切句时仅恢复 SQLite 对话历史并准备好会话通道，绝不自动调用大模型空烧 Token；
 * - 与播放器「整句精读」共用同一份 SQLite `sentenceStudyNote` 会话沉淀。
 */
export function useReaderSentenceCopilot({
    videoId,
    activeSentence,
    focusedText,
    allSentences,
}: UseReaderSentenceCopilotParams) {
    const sentenceFileHash = activeSentence?.fileHash ?? '';
    const sentenceIndex = activeSentence?.index ?? null;
    const sentenceText = (focusedText ?? activeSentence?.text ?? '').trim();
    const activeKey = videoId && sentenceFileHash && sentenceIndex !== null
        ? `${videoId}:${sentenceFileHash}:${sentenceIndex}`
        : '';

    const [sessionState, setSessionState] = useState<{
        key: string;
        id: string;
        restoredMessages: NonNullable<Awaited<ReturnType<typeof chatApi.getStudyNote>>>['messages'];
    }>({ key: '', id: '', restoredMessages: [] });
    const [cloudAvailable, setCloudAvailable] = useState(false);
    const [sessionInitError, setSessionInitError] = useState<{ key: string; message: string } | null>(null);
    const [input, setInput] = useState('');
    const [attachedFocusExpr, setAttachedFocusExpr] = useState<string | null>(null);
    const [resetNonce, setResetNonce] = useState(0);
    const sessionIdRef = useRef('');
    const epochRef = useRef(0);
    const hydratedSessionRef = useRef('');
    const skipNextRestoreRef = useRef(false);
    const sentencesRef = useRef(allSentences);
    const sentenceTextRef = useRef(sentenceText);

    const activeSessionId = sessionState.key === activeKey ? sessionState.id : '';
    const activeRestoredMessages = useMemo(
        () => (sessionState.key === activeKey ? sessionState.restoredMessages : []),
        [sessionState, activeKey],
    );
    const transport = useMemo(() => new ElectronChatTransport(), []);
    const chat = useChat({
        id: activeSessionId || 'reader-inactive-chat',
        transport,
        throttle: 40,
    });
    const { messages, sendMessage, setMessages, status, stop, error: chatError } = chat;
    const isBusy = status === 'submitted' || status === 'streaming';

    useEffect(() => {
        sentencesRef.current = allSentences;
        sentenceTextRef.current = sentenceText;
    });

    // 在 useChat 切换到真实 activeSessionId 之后再注入恢复的历史消息，避免被切 id 丢弃。
    useEffect(() => {
        if (!activeSessionId) {
            hydratedSessionRef.current = '';
            return;
        }
        if (hydratedSessionRef.current === activeSessionId) {
            return;
        }
        hydratedSessionRef.current = activeSessionId;
        if (activeRestoredMessages.length > 0 && messages.length === 0) {
            setMessages(persistedToUiMessages(activeRestoredMessages));
        }
    }, [activeRestoredMessages, activeSessionId, messages.length, setMessages]);

    useEffect(() => {
        const epoch = ++epochRef.current;

        const closePrevious = () => {
            if (sessionIdRef.current) {
                const staleId = sessionIdRef.current;
                sessionIdRef.current = '';
                void chatApi.closeSession(staleId).catch(() => undefined);
            }
        };

        closePrevious();

        const currentText = sentenceTextRef.current;
        if (!activeKey || !videoId || !sentenceFileHash || sentenceIndex === null || !currentText) {
            return;
        }

        const initSession = async () => {
            try {
                const skipRestore = skipNextRestoreRef.current;
                skipNextRestoreRef.current = false;
                const [available, studyNote] = await Promise.all([
                    Promise.resolve(chatApi.learningAvailable?.() ?? false).catch(() => false),
                    skipRestore
                        ? Promise.resolve(null)
                        : Promise.resolve(
                            chatApi.getStudyNote?.({
                                fileHash: sentenceFileHash,
                                sentenceIndex,
                            }) ?? null,
                        ).catch(() => null),
                ]);

                if (epochRef.current !== epoch) {
                    return;
                }
                setCloudAvailable(Boolean(available));

                const list = sentencesRef.current;
                const pos = list.findIndex((s) => s.fileHash === sentenceFileHash && s.index === sentenceIndex);
                const paragraphLines = pos >= 0
                    ? list.slice(Math.max(0, pos - 4), Math.min(list.length, pos + 5)).map((s) => s.text || '')
                    : [currentText];

                const restoredMessages = studyNote?.messages ?? [];
                const created = await chatApi.createSession({
                    videoId,
                    originalTopic: currentText,
                    paragraphLines,
                    subtitleFileHash: sentenceFileHash,
                    anchorSentenceIndex: sentenceIndex,
                    sentenceKey: buildSentenceStudyKey(sentenceFileHash, sentenceIndex),
                    restoredMessages,
                });

                if (epochRef.current !== epoch) {
                    if (created?.sessionId) {
                        void chatApi.closeSession(created.sessionId).catch(() => undefined);
                    }
                    return;
                }

                if (created?.sessionId) {
                    sessionIdRef.current = created.sessionId;
                    setSessionInitError(null);
                    setSessionState({
                        key: activeKey,
                        id: created.sessionId,
                        restoredMessages,
                    });
                }
            } catch (error) {
                if (epochRef.current === epoch) {
                    setSessionInitError({
                        key: activeKey,
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        };

        void initSession();

        return () => {
            epochRef.current += 1;
            closePrevious();
        };
    }, [activeKey, videoId, sentenceFileHash, sentenceIndex, resetNonce]);

    const dictation = useWhisperDictation({
        onTranscriptReady: useCallback((transcript: string) => {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }, []),
    });

    const handleSubmit = useCallback(async (text: string) => {
        const trimmed = text.trim();
        const activeId = sessionIdRef.current;
        if (!trimmed || !activeId || isBusy) {
            return;
        }
        const focus = attachedFocusExpr?.trim();
        const outbound = focus ? `[聚焦表达: ${focus}]\n${trimmed}` : trimmed;
        setInput('');
        if (focus) {
            setAttachedFocusExpr(null);
        }
        await sendMessage({ text: outbound });
    }, [attachedFocusExpr, isBusy, sendMessage]);

    const clearConversation = useCallback(() => {
        if (isBusy) return;
        setMessages([]);
        skipNextRestoreRef.current = true;
        if (videoId && sentenceFileHash && sentenceIndex !== null && sentenceText.trim()) {
            void chatApi.saveStudyNote?.({
                sentenceKey: buildSentenceStudyKey(sentenceFileHash, sentenceIndex),
                videoId,
                fileHash: sentenceFileHash,
                sentenceIndex,
                originalText: sentenceText,
                messages: [],
            }).catch(() => undefined);
        }
        setResetNonce((prev) => prev + 1);
    }, [isBusy, sentenceFileHash, sentenceIndex, sentenceText, setMessages, videoId]);

    const messageViews = useMemo(
        () => toMessageViews(messages, isBusy),
        [messages, isBusy],
    );

    const retrySessionInit = useCallback(() => {
        setSessionInitError(null);
        setResetNonce((prev) => prev + 1);
    }, []);

    return {
        sessionReady: Boolean(activeSessionId && sentenceFileHash),
        sessionError: sessionInitError?.key === activeKey ? sessionInitError.message : null,
        retrySessionInit,
        cloudAvailable,
        messageViews,
        isBusy,
        chatErrorText: chatError ? (chatError.message || String(chatError)) : null,
        input,
        setInput,
        attachedFocusExpr,
        setAttachedFocusExpr,
        handleSubmit,
        stop,
        clearConversation,
        dictation,
    };
}
