import { describe, expect, it } from 'vitest';
import {
    resolvePlaybackIntervention,
    type PlaybackInterventionSnapshot,
    type PlaybackInterventionStage,
} from '@/frontend/features/player/lib/playback-intervention';

const base: PlaybackInterventionSnapshot = {
    tailPreviewActive: false,
    hasClipStopBound: false,
    hasSrtTender: true,
    seekInFlight: false,
    onPlaySeekTime: null,
    hasTransientPlan: false,
};

describe('playback-intervention 互斥仲裁纯状态机', () => {
    it.each<{
        name: string;
        snapshot: PlaybackInterventionSnapshot;
        expected: PlaybackInterventionStage;
    }>([
        {
            name: 'tailPreview 优先级最高，压过 clip/seek/transientPlan',
            snapshot: {
                ...base,
                tailPreviewActive: true,
                hasClipStopBound: true,
                seekInFlight: true,
                hasTransientPlan: true,
            },
            expected: 'tail-preview',
        },
        {
            name: '即使尚未加载字幕或 seek 在途，练习片段仍由 practice-clip 托管（内部分支决定何时截停）',
            snapshot: {
                ...base,
                hasClipStopBound: true,
                hasSrtTender: false,
                seekInFlight: true,
                hasTransientPlan: true,
            },
            expected: 'practice-clip',
        },
        {
            name: '未加载字幕且非 preview/clip 时固定 idle',
            snapshot: {
                ...base,
                hasSrtTender: false,
                seekInFlight: true,
                hasTransientPlan: true,
            },
            expected: 'idle',
        },
        {
            name: 'seekInFlight 为 true 时阻断 transientPlan 与句末判定',
            snapshot: {
                ...base,
                seekInFlight: true,
                hasTransientPlan: true,
            },
            expected: 'seeking',
        },
        {
            name: 'onPlaySeekTime 非空（自动暂停待续播）同样视作 seeking 门控',
            snapshot: {
                ...base,
                onPlaySeekTime: 12.5,
                hasTransientPlan: true,
            },
            expected: 'seeking',
        },
        {
            name: '瞬态计划压过常规句末模式',
            snapshot: {
                ...base,
                hasTransientPlan: true,
            },
            expected: 'transient-plan',
        },
        {
            name: '无任何高优干预且有字幕时进入常规 sentence-end',
            snapshot: base,
            expected: 'sentence-end',
        },
    ])('$name', ({ snapshot, expected }) => {
        expect(resolvePlaybackIntervention(snapshot)).toBe(expected);
    });
});
