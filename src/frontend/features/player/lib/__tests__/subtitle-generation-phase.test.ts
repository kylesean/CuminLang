import { describe, expect, it } from 'vitest';
import {
    canCancelSubtitleGeneration,
    canStartSubtitleGeneration,
    deriveSubtitleGenerationState,
    type SubtitleGenerationMapsSnapshot,
    type SubtitleGenerationPhase,
} from '@/frontend/features/player/lib/subtitle-generation-phase';

const emptySnapshot: SubtitleGenerationMapsSnapshot = {
    taskIdsByVideo: {},
    startingVideos: {},
    cancellingVideos: {},
};

describe('subtitle-generation-phase 纯状态机契约', () => {
    it.each<{
        name: string;
        snapshot: SubtitleGenerationMapsSnapshot;
        videoId: string | null | undefined;
        expectedPhase: SubtitleGenerationPhase;
        expectedTaskId: number | undefined;
        expectedRunning: boolean;
    }>([
        {
            name: 'videoId 为空时固定 idle',
            snapshot: { ...emptySnapshot, startingVideos: { v1: true } },
            videoId: null,
            expectedPhase: 'idle',
            expectedTaskId: undefined,
            expectedRunning: false,
        },
        {
            name: '没有任何活跃记录时为 idle',
            snapshot: emptySnapshot,
            videoId: 'v1',
            expectedPhase: 'idle',
            expectedTaskId: undefined,
            expectedRunning: false,
        },
        {
            name: '注册尚未返回 taskId 时为 starting',
            snapshot: { ...emptySnapshot, startingVideos: { v1: true } },
            videoId: 'v1',
            expectedPhase: 'starting',
            expectedTaskId: undefined,
            expectedRunning: true,
        },
        {
            name: '已分配 taskId 时为 running',
            snapshot: { ...emptySnapshot, taskIdsByVideo: { v1: 101 } },
            videoId: 'v1',
            expectedPhase: 'running',
            expectedTaskId: 101,
            expectedRunning: true,
        },
        {
            name: 'cancelling 优先级高于 starting 与 running，即使无 taskId 也为 cancelling',
            snapshot: {
                taskIdsByVideo: {},
                startingVideos: { v1: true },
                cancellingVideos: { v1: true },
            },
            videoId: 'v1',
            expectedPhase: 'cancelling',
            expectedTaskId: undefined,
            expectedRunning: true,
        },
        {
            name: '不同视频之间互不污染',
            snapshot: {
                taskIdsByVideo: { v2: 202 },
                startingVideos: { v2: true },
                cancellingVideos: { v2: true },
            },
            videoId: 'v1',
            expectedPhase: 'idle',
            expectedTaskId: undefined,
            expectedRunning: false,
        },
    ])('$name', ({ snapshot, videoId, expectedPhase, expectedTaskId, expectedRunning }) => {
        expect(deriveSubtitleGenerationState(snapshot, videoId)).toEqual({
            phase: expectedPhase,
            taskId: expectedTaskId,
            running: expectedRunning,
        });
    });

    it.each<[SubtitleGenerationPhase, boolean, boolean]>([
        ['idle', true, false],
        ['starting', false, true],
        ['running', false, true],
        ['cancelling', false, false],
    ])('阶段 %s: canStart=%s, canCancel=%s', (phase, expectedStart, expectedCancel) => {
        expect(canStartSubtitleGeneration(phase)).toBe(expectedStart);
        expect(canCancelSubtitleGeneration(phase)).toBe(expectedCancel);
    });
});
