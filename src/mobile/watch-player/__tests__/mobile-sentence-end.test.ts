import { describe, expect, it } from 'vitest';
import {
    toggleMobileSentenceEndMode,
    type MobileSentenceEndMode,
} from '@/mobile/watch-player/mobile-sentence-end';

describe('mobile-sentence-end 互斥句末模式', () => {
    it.each<{
        current: MobileSentenceEndMode;
        requested: 'repeat' | 'auto-pause';
        expected: MobileSentenceEndMode;
    }>([
        { current: 'off', requested: 'repeat', expected: 'repeat' },
        { current: 'repeat', requested: 'repeat', expected: 'off' },
        { current: 'auto-pause', requested: 'repeat', expected: 'repeat' },
        { current: 'off', requested: 'auto-pause', expected: 'auto-pause' },
        { current: 'auto-pause', requested: 'auto-pause', expected: 'off' },
        { current: 'repeat', requested: 'auto-pause', expected: 'auto-pause' },
    ])('$current + $requested -> $expected', ({ current, requested, expected }) => {
        expect(toggleMobileSentenceEndMode(current, requested)).toBe(expected);
    });
});
