import { describe, expect, it } from 'vitest';

import {
    buildSubtitleTrackOptions,
    inspectSubtitleTrackDiagnostics,
    inspectSubtitleTrackOrigin,
} from '@/common/utils/subtitle/track-diagnostics';

const CLEAN_AUTHOR_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello everyone, welcome back.

2
00:00:04,000 --> 00:00:07,500
Today we are going to talk about design.
`;

const ROLLING_AUTO_ASR_SRT = `1
00:00:00,840 --> 00:00:06,800
President Jahanian,

2
00:00:04,880 --> 00:00:11,640
faculty, distinguished guests,

3
00:00:08,760 --> 00:00:15,065
>> [cheering] [applause]
`;

describe('字幕轨道质量诊断', () => {
    it.each([
        ['talk.local.srt', CLEAN_AUTHOR_SRT, 'local_asr'],
        ['talk.en-orig.srt', CLEAN_AUTHOR_SRT, 'auto_asr'],
        ['talk.en.srt', ROLLING_AUTO_ASR_SRT, 'auto_asr'],
        ['talk.en.srt', CLEAN_AUTHOR_SRT, 'author'],
        ['talk.srt', CLEAN_AUTHOR_SRT, 'external'],
    ] as const)('根据文件名与正文特征判定 %s 为 %s', (fileName, content, expected) => {
        expect(inspectSubtitleTrackOrigin(content, fileName)).toBe(expected);
    });

    it('对 YouTube 复制成两份的相同 ASR 轨道去重，同时保留独立本地生成轨', () => {
        const tracks = buildSubtitleTrackOptions([
            { path: '/dir/talk.en-orig.srt', fileName: 'talk.en-orig.srt', content: ROLLING_AUTO_ASR_SRT },
            { path: '/dir/talk.en.srt', fileName: 'talk.en.srt', content: ROLLING_AUTO_ASR_SRT },
            { path: '/dir/talk.local.srt', fileName: 'talk.local.srt', content: CLEAN_AUTHOR_SRT },
        ], '/dir/talk.en.srt');

        expect(tracks).toEqual([
            {
                path: '/dir/talk.en.srt',
                fileName: 'talk.en.srt',
                origin: 'auto_asr',
                qualityIssue: 'auto_asr',
                active: true,
            },
            {
                path: '/dir/talk.local.srt',
                fileName: 'talk.local.srt',
                origin: 'local_asr',
                active: false,
            },
        ]);
    });

    it('检测单条超长但极少词数的异常时间轴（疑似缺段），标记 qualityIssue 为 timing_anomaly', () => {
        const brokenAuthorSrt = [
            '1\n00:00:54,000 --> 00:01:32,000\nBecause where ever I go I share a',
            '2\n00:01:32,000 --> 00:01:54,000\nstory with everyone.',
            '3\n00:01:54,000 --> 00:02:40,000\nI believe in the power of words.',
        ].join('\n\n');

        expect(inspectSubtitleTrackDiagnostics(brokenAuthorSrt, 'talk.en.srt')).toEqual({
            origin: 'author',
            qualityIssue: 'timing_anomaly',
        });
        expect(inspectSubtitleTrackDiagnostics(CLEAN_AUTHOR_SRT, 'talk.en.srt')).toEqual({
            origin: 'author',
        });
    });
});
