import { describe, expect, it } from 'vitest';

import MediaUtil from '@/common/utils/MediaUtil';

describe('MediaUtil.formatDisplayTitle', () => {
    it.each([
        ['', ''],
        ['   ', ''],
        ['Andrew Ng: AI Opportunities [o-wv_szZ0V0].mp4', 'Andrew Ng: AI Opportunities'],
        ['A Day in the Lizard Village, UK [KRH8bRvrU6Q].webm', 'A Day in the Lizard Village, UK'],
        ['How to Get More Out of Life [IJq-SLEjdsk]', 'How to Get More Out of Life'],
        ['Inception (2010) [1080p].mkv', 'Inception (2010) [1080p]'],
        ['Dr. House S01E01.mp4', 'Dr. House S01E01'],
        ['[o-wv_szZ0V0].mp4', '[o-wv_szZ0V0]'],
    ])('formats %j -> %j', (input, expected) => {
        expect(MediaUtil.formatDisplayTitle(input)).toBe(expected);
    });
});

describe('MediaUtil 扩展名大小写不敏感', () => {
    it.each([
        ['movie.MP4', true, false, false, true],
        ['movie.MKV', true, false, false, false],
        ['podcast.MP3', false, true, false, true],
        ['track.FLAC', false, true, false, true],
        ['sub.SRT', false, false, true, true],
        ['sub.VTT', false, false, true, true],
        ['sub.ASS', false, false, true, true],
    ])('%s -> video=%s audio=%s subtitle=%s supported=%s', (file, expectedVideo, expectedAudio, expectedSub, expectedSupported) => {
        expect(MediaUtil.isVideo(file)).toBe(expectedVideo);
        expect(MediaUtil.isAudio(file)).toBe(expectedAudio);
        expect(MediaUtil.isSubtitle(file)).toBe(expectedSub);
        expect(MediaUtil.isMedia(file)).toBe(expectedVideo || expectedAudio);
        expect(MediaUtil.supported(file)).toBe(expectedSupported);
    });
});
