import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendClient } from '@/frontend/infrastructure/electron/backendClient';
import { playContextAudio, playMediaSegment, playWord, stopActiveAudio } from '@/frontend/infrastructure/audio/AudioPlayer';

vi.mock('@/frontend/infrastructure/electron/backendClient', () => ({
    backendClient: {
        call: vi.fn(),
    },
}));

vi.mock('@/frontend/log/simple-logger', () => ({
    getRendererLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe('AudioPlayer epoch preemption', () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const audioPlayMock = vi.fn(async () => undefined);
    const audioPauseMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        stopActiveAudio();

        Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            value: {
                speak: speakMock,
                cancel: cancelMock,
            },
        });
        vi.stubGlobal('SpeechSynthesisUtterance', class MockUtterance {
            text: string;
            lang = '';
            rate = 1;
            constructor(text: string) {
                this.text = text;
            }
        });
        vi.stubGlobal('Audio', class MockAudio {
            volume = 1;
            play = audioPlayMock;
            pause = audioPauseMock;
        });
    });

    it('stopActiveAudio 会终止浏览器语音合成并递增值代数，丢弃过期的 TTS/回退播放', async () => {
        let resolveTts!: (value: string) => void;
        vi.mocked(backendClient.call).mockImplementation(
            () => new Promise<string>((resolve) => {
                resolveTts = resolve;
            }),
        );

        const pendingPlay = playContextAudio({ text: 'apple' });
        stopActiveAudio();
        expect(cancelMock).toHaveBeenCalledTimes(2);

        resolveTts('https://example.invalid/tts/apple.mp3');
        await pendingPlay;

        expect(audioPlayMock).not.toHaveBeenCalled();
        expect(speakMock).not.toHaveBeenCalled();
    });

    it('playWord 先清理前序语音后再朗读目标单词', async () => {
        await playWord('banana');

        expect(cancelMock).toHaveBeenCalled();
        expect(speakMock).toHaveBeenCalledTimes(1);
    });

    it('playMediaSegment 在精确到达 endTime 时立即结束而不再额外多播 +0.12s 尾音', async () => {
        const fakeMedia = {
            preload: '',
            muted: false,
            volume: 1,
            playbackRate: 1,
            currentTime: 0,
            src: '',
            listeners: new Map<string, Set<() => void>>(),
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            load: vi.fn(),
            pause: vi.fn(),
            play: vi.fn().mockResolvedValue(undefined),
            addEventListener(type: string, fn: () => void) {
                if (!this.listeners.has(type)) this.listeners.set(type, new Set());
                this.listeners.get(type)!.add(fn);
            },
            removeEventListener(type: string, fn: () => void) {
                this.listeners.get(type)?.delete(fn);
            },
            emit(type: string) {
                this.listeners.get(type)?.forEach((fn) => fn());
            },
        };

        const origCreateElement = document.createElement.bind(document);
        const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (
            tag === 'video' ? (fakeMedia as unknown as HTMLVideoElement) : origCreateElement(tag)
        )) as typeof document.createElement);

        try {
            const pending = playMediaSegment('/videos/test.mp4', 10, 14, 1);
            fakeMedia.emit('loadedmetadata');
            expect(fakeMedia.currentTime).toBe(10);
            fakeMedia.emit('seeked');

            // 13.95s 尚未到达 endTime=14s，不应停播
            fakeMedia.currentTime = 13.95;
            fakeMedia.emit('timeupdate');
            expect(fakeMedia.pause).not.toHaveBeenCalled();

            // 精确到达 14.0s 时即刻收束，不再多播 0.12s
            fakeMedia.currentTime = 14.0;
            fakeMedia.emit('timeupdate');
            await pending;
            expect(fakeMedia.pause).toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });
});
