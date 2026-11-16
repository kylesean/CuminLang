import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/frontend/i18n';
import ScriptReaderPage from '../ScriptReaderPage';
import useSubtitleTranslation from '@/frontend/features/player/translationStore';
import { useSubtitleGenerationStore } from '@/frontend/features/player/subtitleGenerationStore';

const mockNavigate = vi.fn();
const mockListReaderDocuments = vi.fn();
const mockExportReaderMarkdown = vi.fn();
const mockParseSubtitleToSentences = vi.fn();
const mockMatchSubtitleVocabulary = vi.fn();
const mockGetDocumentDifficultWords = vi.fn();
const mockSubtitleComprehension = vi.fn();
const mockSaveEditedSubtitle = vi.fn();
const mockSelectFiles = vi.fn();
const mockCreateWatchHistoryEntries = vi.fn();
const mockAttachSubtitleTrack = vi.fn();
const mockListSavedKeys = vi.fn();
const mockListSavedSentences = vi.fn();
const mockSaveSentence = vi.fn();
const mockUpdateSavedSentence = vi.fn();
const mockPlayContextAudio = vi.fn();
const mockStopActiveAudio = vi.fn();
const mockUpdateWordState = vi.fn();
const mockGetResourceStatus = vi.fn();
const mockCreateChatSession = vi.fn();
const mockCloseChatSession = vi.fn();
const mockGetStudyNote = vi.fn();
const mockLearningAvailable = vi.fn();
const mockStartSubtitleGen = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/frontend/features/context-studio/contextStudioApi', () => ({
    contextStudioApi: {
        listReaderDocuments: (...args: unknown[]) => mockListReaderDocuments(...args),
        exportReaderMarkdown: (...args: unknown[]) => mockExportReaderMarkdown(...args),
        listSavedKeys: (...args: unknown[]) => mockListSavedKeys(...args),
        listSavedSentences: (...args: unknown[]) => mockListSavedSentences(...args),
        saveSentence: (...args: unknown[]) => mockSaveSentence(...args),
        updateSavedSentence: (...args: unknown[]) => mockUpdateSavedSentence(...args),
        unsaveSentence: vi.fn().mockResolvedValue(true),
    },
}));

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        parseSubtitleToSentences: (...args: unknown[]) => mockParseSubtitleToSentences(...args),
        matchSubtitleVocabulary: (...args: unknown[]) => mockMatchSubtitleVocabulary(...args),
        getDocumentDifficultWords: (...args: unknown[]) => mockGetDocumentDifficultWords(...args),
        subtitleComprehension: (...args: unknown[]) => mockSubtitleComprehension(...args),
        saveEditedSubtitle: (...args: unknown[]) => mockSaveEditedSubtitle(...args),
        selectFiles: (...args: unknown[]) => mockSelectFiles(...args),
        createWatchHistoryEntries: (...args: unknown[]) => mockCreateWatchHistoryEntries(...args),
        attachSubtitleTrack: (...args: unknown[]) => mockAttachSubtitleTrack(...args),
        startSubtitleGeneration: (...args: unknown[]) => mockStartSubtitleGen(...args),
        cancelSubtitleGeneration: vi.fn().mockResolvedValue(undefined),
        updateSubtitleTranslationDemand: vi.fn().mockResolvedValue(undefined),
        releaseSubtitleTranslationSession: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/frontend/features/video-learning/videoLearningApi', () => ({
    videoLearningApi: {
        updateWordState: (...args: unknown[]) => mockUpdateWordState(...args),
    },
}));

vi.mock('@/frontend/features/settings/settingsApi', () => ({
    settingsApi: {
        getResourceStatus: (...args: unknown[]) => mockGetResourceStatus(...args),
    },
}));

vi.mock('@/frontend/features/chat/chatApi', () => ({
    chatApi: {
        createSession: (...args: unknown[]) => mockCreateChatSession(...args),
        closeSession: (...args: unknown[]) => mockCloseChatSession(...args),
        stopSession: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn(),
        getStudyNote: (...args: unknown[]) => mockGetStudyNote(...args),
        saveStudyNote: vi.fn().mockResolvedValue({}),
        learningAvailable: (...args: unknown[]) => mockLearningAvailable(...args),
        listPromptPresets: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/frontend/features/chat/useWhisperDictation', () => ({
    useWhisperDictation: () => ({
        isRecording: false,
        isSupported: false,
        isTranscribing: false,
        isRequesting: false,
        bands: [],
        toggle: vi.fn(),
        stop: vi.fn(),
    }),
}));

vi.mock('@/frontend/infrastructure/audio/AudioPlayer', () => ({
    playContextAudio: (...args: unknown[]) => mockPlayContextAudio(...args),
    stopActiveAudio: (...args: unknown[]) => mockStopActiveAudio(...args),
    playWord: vi.fn(),
    getTtsUrl: vi.fn(),
    playAudioUrl: vi.fn(),
}));

describe('ScriptReaderPage - Refactored Book & Inspector Intensive Studio', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('zh-CN');
    });

    beforeEach(() => {
        vi.resetAllMocks();
        localStorage.clear();
        useSubtitleTranslation.setState({
            engine: 'none',
            activeFileHash: null,
            translations: new Map(),
        });
        useSubtitleGenerationStore.setState({
            taskIdsByVideo: {},
            startingVideos: {},
            cancellingVideos: {},
        });
        mockListReaderDocuments.mockResolvedValue([
            {
                videoId: 'vid-101',
                title: 'Stanford Commencement',
                srtFile: '/videos/stanford.srt',
                videoPath: '/videos/stanford.mp4',
                updatedAt: '2026-11-12T00:00:00Z',
                mediaType: 'video',
                hasSubtitle: true,
            },
        ]);
        mockListSavedKeys.mockResolvedValue([]);
        mockListSavedSentences.mockResolvedValue([]);
        mockMatchSubtitleVocabulary.mockResolvedValue({ cancelled: false, wordStates: {} });
        mockGetDocumentDifficultWords.mockResolvedValue({ words: [] });
        mockSubtitleComprehension.mockResolvedValue({
            score: 0.4,
            band: 'hard',
            knownContentRatio: 0.5,
            syntaxComplexity: 0.7,
            contentWords: 6,
            unknownWords: ['honored'],
        });
        mockPlayContextAudio.mockResolvedValue('native');
        mockUpdateWordState.mockResolvedValue({ success: true });
        mockLearningAvailable.mockResolvedValue(true);
        mockGetStudyNote.mockResolvedValue(null);
        mockCreateChatSession.mockResolvedValue({ sessionId: 'sess-reader-1' });
        mockCloseChatSession.mockResolvedValue(undefined);
        mockGetResourceStatus.mockResolvedValue({ transcription: { ready: true } });
        mockExportReaderMarkdown.mockResolvedValue({ success: true, path: '/tmp/Stanford.md' });
        mockSaveSentence.mockResolvedValue({
            id: 1,
            sentenceKey: 'h-101:0',
            videoId: 'vid-101',
            videoTitle: 'Stanford Commencement',
            fileHash: 'h-101',
            sentenceIndex: 0,
            startTime: 1,
            endTime: 4,
            text: 'I am honored to be with you today.',
            textZh: '我很荣幸今天能和你们在一起。',
            note: '连读注意',
            tag: 'expression',
            createdAt: '',
            updatedAt: '',
        });
        mockParseSubtitleToSentences.mockResolvedValue({
            fileHash: 'h-101',
            sentences: [
                {
                    fileHash: 'h-101',
                    index: 0,
                    start: 1,
                    end: 4,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'I am honored to be with you today.',
                    textZH: '我很荣幸今天能和你们在一起。',
                    key: 'k-0',
                    transGroup: 1,
                    translationKey: 'h-101:0',
                    struct: { original: '', blocks: [] },
                },
                {
                    fileHash: 'h-101',
                    index: 1,
                    start: 30,
                    end: 34,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'Stay hungry, stay foolish.',
                    textZH: '求知若饥，虚心若愚。',
                    key: 'k-1',
                    transGroup: 1,
                    translationKey: 'h-101:1',
                    struct: { original: '', blocks: [] },
                },
            ],
        });
    });

    it('renders borderless book paragraphs, right inspector, single-shot audio, notes, mark-known, proofread edit, and markdown export', async () => {
        render(
            <MemoryRouter>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            const row0 = screen.getByTestId('script-sentence-row-0');
            expect(row0.textContent).toContain('I am honored to be with you today.');
            expect(screen.getByText('我很荣幸今天能和你们在一起。')).toBeDefined();
        });

        // 彻底移除旧的底部连续播控条、假阅读分钟数及假章节分割条
        expect(screen.queryByTestId('script-audio-bar')).toBeNull();
        expect(screen.queryByRole('radio', { name: /逐句/i })).toBeNull();
        expect(screen.queryByTestId('script-scene-divider')).toBeNull();
        expect(screen.queryByText(/分钟精读/)).toBeNull();

        // 单词级交互节点存在
        expect(screen.getByText('honored').closest('[data-word="true"]')).not.toBeNull();

        // 右侧精读案头展示本句生词与难度诊断，且不会自动触发 LLM 提问
        const inspector = await screen.findByTestId('script-reader-inspector');
        expect(await within(inspector).findByText('难点长句/生词较多')).toBeDefined();
        expect(within(inspector).getByText('honored')).toBeDefined();

        // 单句点读原声（不自动连播）
        fireEvent.click(screen.getByTestId('inspector-play-sentence'));
        await waitFor(() => {
            expect(mockPlayContextAudio).toHaveBeenCalledTimes(1);
            expect(mockPlayContextAudio).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'I am honored to be with you today.',
                    videoPath: '/videos/stanford.mp4',
                    playbackRate: 1,
                    waitForEnd: true,
                }),
            );
        });

        // 在右侧案头将生词标为已掌握
        fireEvent.click(within(inspector).getByRole('button', { name: /标熟 honored/i }));
        await waitFor(() => {
            expect(mockUpdateWordState).toHaveBeenCalledWith('honored', 'known');
        });

        // 搜索过滤与重置
        const searchInput = screen.getByPlaceholderText('搜文稿/译文...');
        fireEvent.change(searchInput, { target: { value: 'hungry' } });
        expect(screen.queryByTestId('script-sentence-row-0')).toBeNull();
        expect(screen.getByTestId('script-sentence-row-1')).toBeDefined();

        fireEvent.change(searchInput, { target: { value: '' } });
        expect(screen.getByTestId('script-sentence-row-0')).toBeDefined();

        // 收藏金句与保存右侧笔记
        fireEvent.click(within(inspector).getByRole('button', { name: /收藏金句/i }));
        await waitFor(() => {
            expect(mockSaveSentence).toHaveBeenCalledWith(
                expect.objectContaining({
                    sentenceKey: 'h-101:0',
                    videoId: 'vid-101',
                }),
            );
        });

        // 展开紧凑折叠的笔记编辑区：不再强迫选择「通用」，3 个分类标签为弱可选并支持反选
        fireEvent.click(within(inspector).getByRole('button', { name: /记录笔记|编辑/ }));
        expect(within(inspector).queryByRole('radio', { name: '通用' })).toBeNull();
        const textarea = within(inspector).getByPlaceholderText(/随手记下理解/);
        fireEvent.change(textarea, { target: { value: '连读注意' } });
        const exprChip = within(inspector).getByRole('button', { name: '地道表达' });
        expect(exprChip.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(exprChip);
        expect(exprChip.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(exprChip);
        expect(exprChip.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(exprChip);
        expect(exprChip.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(within(inspector).getByRole('button', { name: /保存笔记/i }));
        await waitFor(() => {
            expect(mockUpdateSavedSentence).toHaveBeenCalledWith(
                expect.objectContaining({
                    sentenceKey: 'h-101:0',
                    tag: 'expression',
                    note: '连读注意',
                }),
            );
        });

        // 一键导出 Markdown 讲义
        fireEvent.click(screen.getByRole('button', { name: /导出讲义/i }));
        await waitFor(() => {
            expect(mockExportReaderMarkdown).toHaveBeenCalledWith(
                expect.objectContaining({
                    defaultFileName: 'Stanford Commencement',
                    markdown: expect.stringContaining('# Stanford Commencement'),
                }),
            );
        });

        // 点击「校对原文」进入原地行内编辑并提交保存 .edited.srt
        mockSaveEditedSubtitle.mockResolvedValueOnce({
            srt: {
                filePath: '/videos/stanford.edited.srt',
                fileHash: 'h-edited-1',
                sentences: [
                    {
                        fileHash: 'h-edited-1',
                        index: 0,
                        start: 1,
                        end: 4,
                        adjustedStart: null,
                        adjustedEnd: null,
                        text: 'I am deeply honored to be here today.',
                        textZH: '我很荣幸今天能和你们在一起。',
                        key: 'k-0',
                        transGroup: 1,
                        translationKey: 'h-edited-1:0',
                        struct: { original: '', blocks: [] },
                    },
                ],
            },
            resolution: { origin: 'user_edited', subtitlePath: '/videos/stanford.edited.srt', tracks: [] },
        });
        fireEvent.click(screen.getByTestId('inspector-proofread-btn'));
        const inlineEditor = await screen.findByTestId('script-inline-editor');
        fireEvent.change(inlineEditor, { target: { value: 'I am deeply honored to be here today.' } });
        fireEvent.keyDown(inlineEditor, { key: 'Enter' });

        await waitFor(() => {
            expect(mockSaveEditedSubtitle).toHaveBeenCalledWith(
                expect.objectContaining({
                    videoId: 'vid-101',
                    oldFileHash: 'h-101',
                }),
            );
        });

        // 点击第 2 句后点右侧定位图标跳转播放器
        fireEvent.click(screen.getByTestId('script-sentence-row-1'));
        fireEvent.click(within(inspector).getByRole('button', { name: /定位画面/i }));
        expect(mockNavigate).toHaveBeenCalledWith('/player/vid-101?t=30');
    });

    it('switches documents through collapsible drawer and supports importing pure audio when ASR model is missing', async () => {
        mockListReaderDocuments
            .mockResolvedValueOnce([
                {
                    videoId: 'vid-101',
                    title: 'Stanford Commencement',
                    srtFile: '/videos/stanford.srt',
                    videoPath: '/videos/stanford.mp4',
                    updatedAt: '2026-11-12T00:00:00Z',
                    mediaType: 'video',
                    hasSubtitle: true,
                },
                {
                    videoId: 'vid-202',
                    title: 'Second Talk',
                    srtFile: '/videos/second.srt',
                    videoPath: '/videos/second.mp4',
                    updatedAt: '2026-11-12T00:00:00Z',
                    mediaType: 'video',
                    hasSubtitle: true,
                },
            ])
            .mockResolvedValueOnce([
                {
                    videoId: 'aud-303',
                    title: 'Podcast Ep1',
                    srtFile: '',
                    videoPath: '/audio/ep1.mp3',
                    updatedAt: '2026-11-17T00:00:00Z',
                    mediaType: 'audio',
                    hasSubtitle: false,
                },
            ]);
        mockSelectFiles.mockResolvedValueOnce(['/audio/ep1.mp3']);
        mockCreateWatchHistoryEntries.mockResolvedValueOnce(['aud-303']);
        mockGetResourceStatus.mockResolvedValueOnce({ transcription: { ready: false } });

        render(
            <MemoryRouter initialEntries={['/reader']}>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('script-doc-switcher')).toBeDefined();
        });

        fireEvent.click(screen.getByTestId('script-doc-switcher'));
        const secondDoc = await screen.findByText('Second Talk');
        fireEvent.click(secondDoc);
        expect(mockNavigate).toHaveBeenCalledWith('/reader/vid-202', { replace: true });

        // 点击导入纯音频，当无 ASR 模型时页内展示安装模型与挂载 .srt 引导
        fireEvent.click(screen.getByRole('button', { name: /导入音频/i }));
        await waitFor(() => {
            expect(mockCreateWatchHistoryEntries).toHaveBeenCalledWith(['/audio/ep1.mp3']);
            expect(screen.getByText('尚未安装本地语音识别模型')).toBeDefined();
        });

        fireEvent.click(screen.getByRole('button', { name: /前往设置安装模型/i }));
        expect(mockNavigate).toHaveBeenCalledWith('/settings/resources');
    });

    it('immediately starts local ASR transcription when importing pure audio with a ready model', async () => {
        mockListReaderDocuments
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    videoId: 'aud-ready-1',
                    title: 'Daily Radio',
                    srtFile: '',
                    videoPath: '/audio/daily.m4a',
                    updatedAt: '2026-11-17T00:00:00Z',
                    mediaType: 'audio',
                    hasSubtitle: false,
                },
            ]);
        mockSelectFiles.mockResolvedValueOnce(['/audio/daily.m4a']);
        mockCreateWatchHistoryEntries.mockResolvedValueOnce(['aud-ready-1']);
        mockGetResourceStatus.mockResolvedValueOnce({ transcription: { ready: true } });
        mockStartSubtitleGen.mockResolvedValueOnce(77);

        render(
            <MemoryRouter initialEntries={['/reader']}>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        const importBtn = await screen.findByRole('button', { name: /导入音频/i });
        fireEvent.click(importBtn);

        await waitFor(() => {
            expect(mockStartSubtitleGen).toHaveBeenCalledWith('aud-ready-1');
            expect(screen.getByText('正在本地语音转写生成精读文稿...')).toBeDefined();
        });
    });

    it('toggles bilingual Chinese translation cleanly across natural paragraphs', async () => {
        useSubtitleTranslation.setState({
            activeFileHash: 'h-ai',
            translations: new Map([['h-ai:0', '这是 AI 翻译的中文。']]),
        });
        mockParseSubtitleToSentences.mockResolvedValue({
            fileHash: 'h-ai',
            sentences: [
                {
                    fileHash: 'h-ai',
                    index: 0,
                    start: 1,
                    end: 4,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'English only source subtitle.',
                    textZH: '',
                    key: 'k-ai-0',
                    transGroup: 1,
                    translationKey: 'h-ai:0',
                    struct: { original: '', blocks: [] },
                },
            ],
        });

        render(
            <MemoryRouter>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText('这是 AI 翻译的中文。')).toBeDefined();
        });

        const toggleBtn = screen.getByRole('button', { name: /显示 \/ 隐藏中文译文/i });
        expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(toggleBtn);
        expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
        expect(screen.queryByText('这是 AI 翻译的中文。')).toBeNull();

        fireEvent.click(toggleBtn);
        expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('这是 AI 翻译的中文。')).toBeDefined();
    });

    it('merges split mid-sentence cues into one logical study unit, preserves chat session across note saves, and shows translation loading indicator', async () => {
        useSubtitleTranslation.setState({
            engine: 'tencent',
            activeFileHash: 'h-split',
            translations: new Map(),
        });
        mockSubtitleComprehension.mockResolvedValue({
            score: 0.6,
            band: 'high',
            knownContentRatio: 0.8,
            syntaxComplexity: 0.4,
            contentWords: 10,
            unknownWords: [],
        });
        mockParseSubtitleToSentences.mockResolvedValue({
            fileHash: 'h-split',
            sentences: [
                {
                    fileHash: 'h-split',
                    index: 0,
                    start: 22.24,
                    end: 23.52,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'And you have a four-part',
                    textZH: '',
                    key: 'k-s-0',
                    transGroup: 1,
                    translationKey: 'h-split:0',
                    struct: { original: '', blocks: [] },
                },
                {
                    fileHash: 'h-split',
                    index: 1,
                    start: 23.84,
                    end: 27.36,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'framework that helps us communicate.',
                    textZH: '',
                    key: 'k-s-1',
                    transGroup: 1,
                    translationKey: 'h-split:1',
                    struct: { original: '', blocks: [] },
                },
            ],
        });

        render(
            <MemoryRouter>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        const inspector = await screen.findByTestId('script-reader-inspector');
        await waitFor(() => {
            expect(within(inspector).getByText('And you have a four-part framework that helps us communicate.')).toBeDefined();
        });

        // 未到着的译文显示温和加载提示，而非沉默空白
        expect(screen.getByText('译文加载中...')).toBeDefined();

        // 播放当前完整意群句（起止时间覆盖 cue 0 -> cue 1，而非仅播前半截）
        fireEvent.click(screen.getByTestId('inspector-play-sentence'));
        await waitFor(() => {
            expect(mockPlayContextAudio).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'And you have a four-part framework that helps us communicate.',
                    startTime: 22.24,
                    endTime: 27.36,
                }),
            );
        });

        // 在 AI 会话已建立后保存个人笔记，绝不能触发 closeSession 销毁当前 AI 会话
        await waitFor(() => {
            expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
        });
        mockCloseChatSession.mockClear();

        // 展开紧凑折叠的笔记编辑区后再写笔记并保存
        fireEvent.click(within(inspector).getByRole('button', { name: /记录笔记|编辑/ }));
        const textarea = within(inspector).getByPlaceholderText(/随手记下理解/);
        fireEvent.change(textarea, { target: { value: '完整意群笔记' } });
        fireEvent.click(within(inspector).getByRole('button', { name: /保存笔记/i }));

        await waitFor(() => {
            expect(mockSaveSentence).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'And you have a four-part framework that helps us communicate.',
                    note: '完整意群笔记',
                }),
            );
        });
        expect(mockCloseChatSession).not.toHaveBeenCalled();
    });

    it('switches focused sentence when clicking any word in text or pressing ArrowLeft/ArrowRight', async () => {
        const longSentences = Array.from({ length: 5 }, (_, idx) => ({
            fileHash: 'h-nav',
            index: idx,
            start: idx * 30 + 15,
            end: idx * 30 + 25,
            adjustedStart: null,
            adjustedEnd: null,
            text: `Chapter ${idx + 1} opening sentence.`,
            textZH: `第 ${idx + 1} 句译文。`,
            key: `k-nav-${idx}`,
            transGroup: 1,
            translationKey: `h-nav:${idx}`,
            struct: { original: '', blocks: [] },
        }));
        mockParseSubtitleToSentences.mockResolvedValue({
            fileHash: 'h-nav',
            sentences: longSentences,
        });

        render(
            <MemoryRouter>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        const inspector = await screen.findByTestId('script-reader-inspector');
        await waitFor(() => {
            expect(within(inspector).getByText('Chapter 1 opening sentence.')).toBeDefined();
        });

        // 点击正文某个单词（而非仅点右侧 <> 箭头），右侧精读案头立即跟进切句
        const allChapterWords = screen.getAllByText('Chapter');
        fireEvent.click(allChapterWords[2]);
        await waitFor(() => {
            expect(within(inspector).getByText('Chapter 3 opening sentence.')).toBeDefined();
        });

        // 键盘左右方向键也能直接切上下句
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        await waitFor(() => {
            expect(within(inspector).getByText('Chapter 2 opening sentence.')).toBeDefined();
        });

        // 切换「生词」「金句」筛选时不展示右侧 "0 句" 等浮动计数，且能给出清晰空筛选态
        fireEvent.click(screen.getByRole('radio', { name: '生词' }));
        expect(screen.getByText('当前筛选或搜索条件没有匹配句子')).toBeDefined();
        expect(screen.queryByText(/^\d+\s*句$/)).toBeNull();

        fireEvent.click(screen.getByRole('radio', { name: '金句' }));
        expect(screen.queryByText(/^\d+\s*句$/)).toBeNull();
    });

    it('supports cold-start candidate difficult words filter and seamless CJK merged translations', async () => {
        mockGetDocumentDifficultWords.mockResolvedValue({ words: ['framework'] });
        mockParseSubtitleToSentences.mockResolvedValue({
            fileHash: 'h-cjk',
            sentences: [
                {
                    fileHash: 'h-cjk',
                    index: 0,
                    start: 1,
                    end: 3,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'Simple greeting.',
                    textZH: '简单问候。',
                    key: 'kc-0',
                    transGroup: 1,
                    translationKey: 'h-cjk:0',
                    struct: { original: '', blocks: [] },
                },
                {
                    fileHash: 'h-cjk',
                    index: 1,
                    start: 3.1,
                    end: 5,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'And you have a four-part',
                    textZH: '我们有一个四部分的',
                    key: 'kc-1',
                    transGroup: 1,
                    translationKey: 'h-cjk:1',
                    struct: { original: '', blocks: [] },
                },
                {
                    fileHash: 'h-cjk',
                    index: 2,
                    start: 5.1,
                    end: 8,
                    adjustedStart: null,
                    adjustedEnd: null,
                    text: 'framework that helps us communicate.',
                    textZH: '框架，可以帮助我们沟通。',
                    key: 'kc-2',
                    transGroup: 1,
                    translationKey: 'h-cjk:2',
                    struct: { original: '', blocks: [] },
                },
            ],
        });

        render(
            <MemoryRouter>
                <ScriptReaderPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('script-sentence-row-1')).toBeDefined();
        });

        // 中文跨行译文不再插入多余空格
        const zhParagraph = screen.getByText('我们有一个四部分的').closest('p');
        expect(zhParagraph?.textContent).toContain('我们有一个四部分的框架，可以帮助我们沟通。');
        expect(zhParagraph?.textContent).not.toContain('四部分的 框架');

        // 未手动加入个人生词本时，「生词」仍能依托本地词典难点候选筛选命中对应句
        await waitFor(() => {
            expect(screen.getByText(/本篇生词/)).toBeDefined();
        });
        fireEvent.click(screen.getByRole('radio', { name: '生词' }));
        expect(screen.queryByTestId('script-sentence-row-0')).toBeNull();
        expect(screen.getByTestId('script-sentence-row-2')).toBeDefined();
    });
});
