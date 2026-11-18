import { describe, it, expect } from 'vitest';
import MatchSrt from '@/backend/utils/MatchSrt';

describe('MatchSrt', () => {
    it('英语字幕优先于中文，即使中文是 srt 而英语是 vtt', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.zh.srt',
            '/tmp/movie.en.vtt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.en.vtt');
    });

    it('显式英语后缀优先于无后缀的纯同名字幕', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.srt',
            '/tmp/movie.en.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.en.srt');
    });

    it('无后缀纯同名字幕优先于中文后缀字幕', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.zh.srt',
            '/tmp/movie.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.srt');
    });

    it('语言相同时，srt 优先于 vtt', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.en.vtt',
            '/tmp/movie.en.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.en.srt');
    });

    it('语言档位相同（同为纯同名）时，srt 优先于 vtt', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.vtt',
            '/tmp/movie.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.srt');
    });

    it('模糊匹配时名称相似度优先于格式', () => {
        const videoPath = '/tmp/movie_2026.mp4';
        const subs = [
            '/tmp/movie_2026.srt',
            '/tmp/movie_other.vtt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie_2026.srt');
    });

    /*
     * `.local.srt` / `.edited.srt` 是应用自己产出的权威轨，不是「某种语言变体」。
     * 它们必须排在外部下载轨之前，否则本地精修成果会被同名的 `.en.srt` 顶掉，
     * 用户会看到「明明生成过更好的字幕，播放时却还挂着平台自动字幕」。
     */
    it('本地精修轨优先于作者轨与平台自动轨', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.en.srt',
            '/tmp/movie.en-orig.srt',
            '/tmp/movie.local.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.local.srt');
    });

    it('用户手工编辑轨优先于本地精修轨', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.local.srt',
            '/tmp/movie.edited.srt',
        ];

        const matches = MatchSrt.matchAll(videoPath, subs);
        expect(matches[0]).toBe('/tmp/movie.edited.srt');
    });

    it('本地精修轨排在候选列表首位，即便作者轨也在同一目录', () => {
        const videoPath = '/tmp/movie.mp4';
        const subs = [
            '/tmp/movie.en.srt',
            '/tmp/movie.local.srt',
            '/tmp/movie.zh.srt',
        ];

        const exact = MatchSrt.matchExactTracks(videoPath, subs);
        expect(exact[0]).toBe('/tmp/movie.local.srt');
        expect(exact).toContain('/tmp/movie.en.srt');
    });
});
