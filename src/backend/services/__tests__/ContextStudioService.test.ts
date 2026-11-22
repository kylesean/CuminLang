import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { isPackaged: true, getPath: () => '/tmp/dashplayer-context-studio-test' },
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createMemoryDb, type MemoryDb } from '@/test/database';
import SavedSentenceRepositoryImpl from '@/backend/infrastructure/db/repositories/SavedSentenceRepositoryImpl';
import ContextStudioService from '@/backend/services/ContextStudioService';
import MediaPathRegistry from '@/backend/services/MediaPathRegistry';
import { watchHistory } from '@/backend/infrastructure/db/tables/watchHistory';
import { wordEncounter } from '@/backend/infrastructure/db/tables/wordEncounter';
import { sentenceTranslates } from '@/backend/infrastructure/db/tables/sentenceTranslates';

describe('ContextStudioService & SavedSentenceRepository', () => {
    let memoryDb: MemoryDb | null = null;

    afterEach(() => {
        memoryDb?.close();
        memoryDb = null;
    });

    it('收藏、更新、查询与取消收藏金句（零物理切片元数据模型）', async () => {
        memoryDb = createMemoryDb();
        const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
        const service = new ContextStudioService(repo, memoryDb.db);

        await memoryDb.db.insert(watchHistory).values({
            id: 'vid-1',
            base_path: '/videos',
            file_name: 'steve-jobs-stanford.mp4',
            project_type: 1,
            srt_file: '/videos/steve-jobs-stanford.srt',
        });

        const saved = await service.saveSentence({
            sentenceKey: 'hash-1:12',
            videoId: 'vid-1',
            fileHash: 'hash-1',
            sentenceIndex: 12,
            startTime: 45.2,
            endTime: 49.8,
            text: 'Stay hungry, stay foolish.',
            textZh: '求知若饥，虚心若愚。',
            tag: 'expression',
        });

        expect(saved.videoTitle).toBe('steve-jobs-stanford');
        expect(saved.startTime).toBe(45.2);
        expect(saved.endTime).toBe(49.8);
        expect(saved.tag).toBe('expression');

        // 更新笔记与标签
        const updated = await service.updateSavedSentence({
            sentenceKey: 'hash-1:12',
            note: '经典结束语',
            tag: 'general',
        });
        expect(updated?.note).toBe('经典结束语');
        expect(updated?.tag).toBe('general');

        // 查询全部收藏及按视频 ID 查询键
        const all = await service.listSavedSentences();
        expect(all).toHaveLength(1);
        const keys = await service.listSavedKeysByVideo('vid-1');
        expect(keys).toEqual(['hash-1:12']);

        // 取消收藏
        const removed = await service.unsaveSentence('hash-1:12');
        expect(removed).toBe(true);
        expect(await service.listSavedSentences()).toHaveLength(0);
    });

    it('聚合单词在真实视频语境中的出现记录并补齐译文', async () => {
        memoryDb = createMemoryDb();
        const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
        const service = new ContextStudioService(repo, memoryDb.db);

        await memoryDb.db.insert(watchHistory).values({
            id: 'vid-2',
            base_path: '/media/talks',
            file_name: 'serendipity-talk.mkv',
            project_type: 1,
            srt_file: '/media/talks/serendipity-talk.srt',
        });

        await memoryDb.db.insert(wordEncounter).values([
            {
                word: 'serendipity',
                lemma: 'serendipity',
                action: 'lookup',
                video_id: 'vid-2',
                file_hash: 'h-2',
                sentence_index: 5,
                context: 'It was pure serendipity.',
            },
            // 重复句子应被去重
            {
                word: 'serendipity',
                lemma: 'serendipity',
                action: 'save',
                video_id: 'vid-2',
                file_hash: 'h-2',
                sentence_index: 5,
                context: 'It was pure serendipity.',
            },
        ]);

        await memoryDb.db.insert(sentenceTranslates).values({
            sentence: 'It was pure serendipity.',
            translate: '这纯粹是机缘巧合。',
            mode: 'openai#gpt-4o-mini#zh-default',
        });

        const contexts = await service.getWordContexts('Serendipity');
        expect(contexts).toHaveLength(1);
        expect(contexts[0].videoTitle).toBe('serendipity-talk');
        expect(contexts[0].videoPath).toBe('/media/talks/serendipity-talk.mkv');
        expect(contexts[0].context).toBe('It was pure serendipity.');
        expect(contexts[0].contextZh).toBe('这纯粹是机缘巧合。');

        const readerDocs = await service.listReaderDocuments();
        expect(readerDocs).toHaveLength(1);
        expect(readerDocs[0].videoId).toBe('vid-2');
        expect(readerDocs[0].srtFile).toBe('/media/talks/serendipity-talk.srt');
    });

    it('从字幕文件解析原视频起止时间戳并为收藏金句补充 videoPath 以支持原生音频直播', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-ctx-srt-'));
        try {
            const srtPath = path.join(tmpDir, 'talk.srt');
            await fs.writeFile(
                srtPath,
                [
                    '1',
                    '00:00:12,500 --> 00:00:16,200',
                    'It feels like pure serendipity.',
                    '',
                ].join('\n'),
                'utf-8',
            );

            memoryDb = createMemoryDb();
            const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
            const service = new ContextStudioService(repo, memoryDb.db);

            await memoryDb.db.insert(watchHistory).values({
                id: 'vid-native',
                base_path: tmpDir,
                file_name: 'talk.mp4',
                project_type: 1,
                srt_file: srtPath,
            });

            await memoryDb.db.insert(wordEncounter).values({
                word: 'serendipity',
                lemma: 'serendipity',
                action: 'lookup',
                video_id: 'vid-native',
                file_hash: 'h-native',
                sentence_index: 0,
                context: 'It feels like pure serendipity.',
            });

            await service.saveSentence({
                sentenceKey: 'h-native:0',
                videoId: 'vid-native',
                fileHash: 'h-native',
                sentenceIndex: 0,
                startTime: 12.5,
                endTime: 16.2,
                text: 'It feels like pure serendipity.',
            });

            const contexts = await service.getWordContexts('serendipity');
            expect(contexts).toHaveLength(1);
            expect(contexts[0].videoPath).toBe(path.join(tmpDir, 'talk.mp4'));
            expect(contexts[0].startTime).toBeCloseTo(12.5, 2);
            expect(contexts[0].endTime).toBeCloseTo(16.2, 2);

            const savedList = await service.listSavedSentences();
            expect(savedList).toHaveLength(1);
            expect(savedList[0].videoPath).toBe(path.join(tmpDir, 'talk.mp4'));
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('在 srt_file 为空且字幕经过多行意群合并时，仍能发现同名字幕、匹配精确时间区间并授权 mediaPathRegistry', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-ctx-merge-'));
        try {
            const videoPath = path.join(tmpDir, 'adhd-doctor.mp4');
            const srtPath = path.join(tmpDir, 'adhd-doctor.en.srt');
            await fs.writeFile(videoPath, '', 'utf-8');
            await fs.writeFile(
                srtPath,
                [
                    '1',
                    '00:01:02,000 --> 00:01:04,000',
                    'synthesize it, figure out where the holes are,',
                    '',
                    '2',
                    '00:01:04,000 --> 00:01:07,500',
                    'and then figure out how to optimize and approach that.',
                    '',
                ].join('\n'),
                'utf-8',
            );

            memoryDb = createMemoryDb();
            const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
            const registry = new MediaPathRegistry();
            const service = new ContextStudioService(repo, memoryDb.db, registry);

            await memoryDb.db.insert(watchHistory).values({
                id: 'vid-adhd',
                base_path: tmpDir,
                file_name: 'adhd-doctor.mp4',
                project_type: 1,
                srt_file: null,
            });

            await memoryDb.db.insert(wordEncounter).values({
                word: 'approach',
                lemma: 'approach',
                action: 'open',
                video_id: 'vid-adhd',
                context: 'synthesize it, figure out where the holes are, and then figure out how to optimize and approach that.',
            });

            const contexts = await service.getWordContexts('approach');
            expect(contexts).toHaveLength(1);
            expect(contexts[0].startTime).toBeCloseTo(62, 1);
            expect(contexts[0].endTime).toBeCloseTo(67.5, 1);
            expect(registry.isAllowed(videoPath)).toBe(true);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('listReaderDocuments 同时返回有字幕的视频与全部纯音频播客（含尚待转写条目）并过滤无字幕视频与目录', async () => {
        memoryDb = createMemoryDb();
        const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
        const registry = new MediaPathRegistry();
        const service = new ContextStudioService(repo, memoryDb.db, registry);

        await memoryDb.db.insert(watchHistory).values([
            {
                id: 'vid-sub',
                base_path: '/media',
                file_name: 'keynote.mp4',
                project_type: 1,
                srt_file: '/media/keynote.srt',
                updated_at: '2026-11-17T01:00:00Z',
            },
            {
                id: 'vid-nosub',
                base_path: '/media',
                file_name: 'raw-video.mp4',
                project_type: 1,
                srt_file: null,
                updated_at: '2026-11-17T02:00:00Z',
            },
            {
                id: 'pod-pending',
                base_path: '/podcasts',
                file_name: 'episode-01.mp3',
                project_type: 1,
                srt_file: null,
                updated_at: '2026-11-17T03:00:00Z',
            },
            {
                id: 'pod-ready',
                base_path: '/podcasts',
                file_name: 'episode-02.m4a',
                project_type: 1,
                srt_file: '/podcasts/episode-02.local.srt',
                updated_at: '2026-11-17T04:00:00Z',
            },
            {
                id: 'dir-entry',
                base_path: '/podcasts',
                file_name: 'series-dir',
                project_type: 2,
                srt_file: null,
                updated_at: '2026-11-17T05:00:00Z',
            },
        ]);

        const docs = await service.listReaderDocuments();
        expect(docs.map((d) => ({
            videoId: d.videoId,
            mediaType: d.mediaType,
            hasSubtitle: d.hasSubtitle,
        }))).toEqual([
            { videoId: 'pod-ready', mediaType: 'audio', hasSubtitle: true },
            { videoId: 'pod-pending', mediaType: 'audio', hasSubtitle: false },
            { videoId: 'vid-sub', mediaType: 'video', hasSubtitle: true },
        ]);
        expect(registry.isAllowed('/podcasts/episode-01.mp3')).toBe(true);
    });

    it('匹配单词语境时间轴时仅匹配紧邻连续字幕窗口，不会把全片远处重复短语误连成超长片段', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-ctx-span-'));
        try {
            const srtPath = path.join(tmpDir, 'repeat-talk.srt');
            await fs.writeFile(
                srtPath,
                [
                    '1',
                    '00:00:10,000 --> 00:00:13,000',
                    'When you think about framework,',
                    '',
                    '2',
                    '00:00:13,100 --> 00:00:16,000',
                    'it helps us communicate clearly.',
                    '',
                    '3',
                    '00:20:00,000 --> 00:20:02,000',
                    'you think about',
                    '',
                ].join('\n'),
                'utf-8',
            );

            memoryDb = createMemoryDb();
            const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
            const service = new ContextStudioService(repo, memoryDb.db);

            await memoryDb.db.insert(watchHistory).values({
                id: 'vid-span',
                base_path: tmpDir,
                file_name: 'repeat-talk.mp4',
                project_type: 1,
                srt_file: srtPath,
            });
            await memoryDb.db.insert(wordEncounter).values({
                word: 'framework',
                lemma: 'framework',
                action: 'lookup',
                video_id: 'vid-span',
                file_hash: 'h-span',
                sentence_index: 0,
                context: 'When you think about framework, it helps us communicate clearly.',
            });

            const contexts = await service.getWordContexts('framework');
            expect(contexts).toHaveLength(1);
            expect(contexts[0].startTime).toBe(10);
            expect(contexts[0].endTime).toBe(16);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('saveSentence 与 updateSavedSentence 返回保留 videoPath 以防改标签或笔记后丢原生播放能力', async () => {
        memoryDb = createMemoryDb();
        const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
        const registry = new MediaPathRegistry();
        const service = new ContextStudioService(repo, memoryDb.db, registry);

        await memoryDb.db.insert(watchHistory).values({
            id: 'vid-save',
            base_path: '/media/youtube',
            file_name: 'harvard-talk.mp4',
            project_type: 2,
            srt_file: null,
        });

        const saved = await service.saveSentence({
            sentenceKey: 'h-save:1',
            videoId: 'vid-save',
            fileHash: 'h-save',
            sentenceIndex: 1,
            startTime: 10,
            endTime: 14,
            text: 'And you have earned the right to talk about this.',
        });
        expect(saved.videoPath).toBe('/media/youtube/harvard-talk.mp4');
        expect(registry.isAllowed('/media/youtube/harvard-talk.mp4')).toBe(true);

        const updated = await service.updateSavedSentence({
            sentenceKey: 'h-save:1',
            tag: 'expression',
            note: '好表达',
        });
        expect(updated?.tag).toBe('expression');
        expect(updated?.videoPath).toBe('/media/youtube/harvard-talk.mp4');
    });

    it('listReaderDocuments 纳入媒体库子目录视频（project_type=2）且 srt_file 为空时自动发现旁挂英文字幕', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-ctx-dir-reader-'));
        try {
            const videoName = 'How to Communicate [5yCqhY1D-VE].mp4';
            const origSrtName = 'How to Communicate [5yCqhY1D-VE].en-orig.srt';
            const enSrtName = 'How to Communicate [5yCqhY1D-VE].en.srt';
            await fs.writeFile(path.join(tmpDir, videoName), '', 'utf-8');
            await fs.writeFile(path.join(tmpDir, origSrtName), '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf-8');
            await fs.writeFile(path.join(tmpDir, enSrtName), '1\n00:00:01,000 --> 00:00:02,000\nHello.\n', 'utf-8');

            memoryDb = createMemoryDb();
            const repo = new SavedSentenceRepositoryImpl(memoryDb.db);
            const registry = new MediaPathRegistry();
            const service = new ContextStudioService(repo, memoryDb.db, registry);

            await memoryDb.db.insert(watchHistory).values({
                id: 'yt-dir-video',
                base_path: tmpDir,
                file_name: videoName,
                project_type: 2,
                srt_file: null,
            });

            const docs = await service.listReaderDocuments();
            expect(docs).toHaveLength(1);
            expect(docs[0]).toMatchObject({
                videoId: 'yt-dir-video',
                mediaType: 'video',
                hasSubtitle: true,
                srtFile: path.join(tmpDir, enSrtName),
                videoPath: path.join(tmpDir, videoName),
            });
            expect(registry.isAllowed(path.join(tmpDir, videoName))).toBe(true);
            expect(registry.isAllowed(path.join(tmpDir, enSrtName))).toBe(true);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });
});
