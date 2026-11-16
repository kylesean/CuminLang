import { beforeEach, describe, expect, it } from 'vitest';
import useDictionaryStream from '@/frontend/features/player/dictionaryStore';
import type { OpenAIDictionaryResult } from '@/common/types/DictionaryResult';

const sampleResult = (word: string, meaning: string): OpenAIDictionaryResult => ({
    word,
    phonetic: '',
    definitions: [{
        partOfSpeech: 'noun',
        meaning,
        examples: [],
    }],
});

describe('dictionaryStore active request 与大小写归一化守卫', () => {
    beforeEach(() => {
        useDictionaryStream.setState({
            entries: new Map(),
            wordActiveRequest: new Map(),
        });
    });

    it('clearByWord 或新请求替换后，迟到的 receiveUpdate / setFinalResult 不得复活旧条目', () => {
        const store = useDictionaryStream.getState();
        store.startRequest('Running', 'req-1');
        store.receiveUpdate('req-1', 'running', sampleResult('running', 'v1'));
        expect(useDictionaryStream.getState().getActiveEntry('Running')?.data.definitions[0]?.meaning).toBe('v1');

        // 清理后，req-1 的迟到片断与终态不得重新写入词表
        useDictionaryStream.getState().clearByWord('RUNNING');
        expect(useDictionaryStream.getState().getActiveEntry('Running')).toBeUndefined();

        useDictionaryStream.getState().receiveUpdate('req-1', 'running', sampleResult('running', 'resurrected'));
        useDictionaryStream.getState().setFinalResult('running', 'req-1', sampleResult('running', 'resurrected-final'));
        expect(useDictionaryStream.getState().getActiveEntry('Running')).toBeUndefined();

        // 启动 req-2 后，req-1 的迟到事件不得覆盖 req-2
        useDictionaryStream.getState().startRequest('Running', 'req-2');
        useDictionaryStream.getState().receiveUpdate('req-1', 'running', sampleResult('running', 'stale'));
        useDictionaryStream.getState().setFinalResult('running', 'req-1', sampleResult('running', 'stale-final'));
        const active = useDictionaryStream.getState().getActiveEntry('running');
        expect(active?.requestId).toBe('req-2');
        expect(active?.data.definitions).toEqual([]);
    });

    it('按句子语境隔离同一单词的流式更新，不同句子的并发/先后查询互不覆盖', () => {
        const store = useDictionaryStream.getState();
        store.startRequest('make', 'req-a', 'Please make sure it works.');
        store.startRequest('make', 'req-b', 'I will make a cake.');

        store.receiveUpdate('req-a', 'make', sampleResult('make', '确保（语境A）'));
        store.receiveUpdate('req-b', 'make', sampleResult('make', '制作（语境B）'));

        expect(useDictionaryStream.getState().getActiveEntry('make', 'Please make sure it works.')?.data.definitions[0]?.meaning)
            .toBe('确保（语境A）');
        expect(useDictionaryStream.getState().getActiveEntry('make', 'I will make a cake.')?.data.definitions[0]?.meaning)
            .toBe('制作（语境B）');
    });
});
