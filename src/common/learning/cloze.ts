/**
 * 纯前端可用的语境填空（Cloze）与不规则词形/多词语块匹配工具。
 *
 * 避免在浏览器端引入 Node 侧 NLP 依赖，使用轻量后缀归一化 + 高频不规则词表，
 * 支持单语素屈折变化（go / went / gone）与多词动词短语（figure out / figured out）。
 */

export interface ClozeSegment {
    text: string;
    matched: boolean;
}

const IRREGULAR_GROUPS: readonly (readonly string[])[] = [
    ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'],
    ['have', 'has', 'had', 'having'],
    ['do', 'does', 'did', 'done', 'doing'],
    ['go', 'goes', 'went', 'gone', 'going'],
    ['say', 'says', 'said', 'saying'],
    ['make', 'makes', 'made', 'making'],
    ['get', 'gets', 'got', 'gotten', 'getting'],
    ['know', 'knows', 'knew', 'known', 'knowing'],
    ['think', 'thinks', 'thought', 'thinking'],
    ['take', 'takes', 'took', 'taken', 'taking'],
    ['see', 'sees', 'saw', 'seen', 'seeing'],
    ['come', 'comes', 'came', 'coming'],
    ['give', 'gives', 'gave', 'given', 'giving'],
    ['find', 'finds', 'found', 'finding'],
    ['tell', 'tells', 'told', 'telling'],
    ['feel', 'feels', 'felt', 'feeling'],
    ['become', 'becomes', 'became', 'becoming'],
    ['leave', 'leaves', 'left', 'leaving'],
    ['keep', 'keeps', 'kept', 'keeping'],
    ['bring', 'brings', 'brought', 'bringing'],
    ['begin', 'begins', 'began', 'begun', 'beginning'],
    ['hold', 'holds', 'held', 'holding'],
    ['write', 'writes', 'wrote', 'written', 'writing'],
    ['stand', 'stands', 'stood', 'standing'],
    ['hear', 'hears', 'heard', 'hearing'],
    ['mean', 'means', 'meant', 'meaning'],
    ['meet', 'meets', 'met', 'meeting'],
    ['run', 'runs', 'ran', 'running'],
    ['pay', 'pays', 'paid', 'paying'],
    ['sit', 'sits', 'sat', 'sitting'],
    ['speak', 'speaks', 'spoke', 'spoken', 'speaking'],
    ['lie', 'lies', 'lay', 'lain', 'lying'],
    ['lead', 'leads', 'led', 'leading'],
    ['grow', 'grows', 'grew', 'grown', 'growing'],
    ['lose', 'loses', 'lost', 'losing'],
    ['fall', 'falls', 'fell', 'fallen', 'falling'],
    ['send', 'sends', 'sent', 'sending'],
    ['build', 'builds', 'built', 'building'],
    ['understand', 'understands', 'understood', 'understanding'],
    ['draw', 'draws', 'drew', 'drawn', 'drawing'],
    ['break', 'breaks', 'broke', 'broken', 'breaking'],
    ['spend', 'spends', 'spent', 'spending'],
    ['rise', 'rises', 'rose', 'risen', 'rising'],
    ['drive', 'drives', 'drove', 'driven', 'driving'],
    ['buy', 'buys', 'bought', 'buying'],
    ['wear', 'wears', 'wore', 'worn', 'wearing'],
    ['choose', 'chooses', 'chose', 'chosen', 'choosing'],
    ['eat', 'eats', 'ate', 'eaten', 'eating'],
    ['catch', 'catches', 'caught', 'catching'],
    ['teach', 'teaches', 'taught', 'teaching'],
    ['sell', 'sells', 'sold', 'selling'],
    ['sleep', 'sleeps', 'slept', 'sleeping'],
    ['win', 'wins', 'won', 'winning'],
    ['forget', 'forgets', 'forgot', 'forgotten', 'forgetting'],
    ['wake', 'wakes', 'woke', 'woken', 'waking'],
    ['throw', 'throws', 'threw', 'thrown', 'throwing'],
    ['ride', 'rides', 'rode', 'ridden', 'riding'],
    ['hide', 'hides', 'hid', 'hidden', 'hiding'],
    ['shake', 'shakes', 'shook', 'shaken', 'shaking'],
    ['show', 'shows', 'showed', 'shown', 'showing'],
    ['sing', 'sings', 'sang', 'sung', 'singing'],
    ['swim', 'swims', 'swam', 'swum', 'swimming'],
    ['good', 'better', 'best'],
    ['bad', 'worse', 'worst'],
];

const IRREGULAR_STEM_MAP = (() => {
    const map = new Map<string, string>();
    for (const group of IRREGULAR_GROUPS) {
        const root = group[0];
        for (const form of group) {
            map.set(form, root);
        }
    }
    return map;
})();

/** 返回词形可能的词干集合，兼容规则屈折与高频不规则变化。 */
function candidateStems(raw: string): Set<string> {
    const word = raw.toLowerCase();
    const stems = new Set<string>([word]);
    const irregular = IRREGULAR_STEM_MAP.get(word);
    if (irregular) {
        stems.add(irregular);
    }

    if (word.endsWith('ies') && word.length > 4) stems.add(`${word.slice(0, -3)}y`);
    if (word.endsWith('es') && word.length > 3) stems.add(word.slice(0, -2));
    if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) stems.add(word.slice(0, -1));

    if (word.endsWith('ied') && word.length > 4) stems.add(`${word.slice(0, -3)}y`);
    if (word.endsWith('ed') && word.length > 3) {
        const base = word.slice(0, -2);
        stems.add(base);
        stems.add(`${base}e`);
        if (base.length >= 2 && base.at(-1) === base.at(-2)) {
            stems.add(base.slice(0, -1));
        }
    }

    if (word.endsWith('ing') && word.length > 4) {
        const base = word.slice(0, -3);
        stems.add(base);
        stems.add(`${base}e`);
        if (base.length >= 2 && base.at(-1) === base.at(-2)) {
            stems.add(base.slice(0, -1));
        }
    }

    if (word.endsWith('er') && word.length > 3) stems.add(word.slice(0, -2));
    if (word.endsWith('est') && word.length > 4) stems.add(word.slice(0, -3));
    return stems;
}

function tokensEquivalent(surface: string, targetToken: string): boolean {
    const s = surface.toLowerCase();
    const t = targetToken.toLowerCase();
    if (s === t) return true;
    const sStems = candidateStems(s);
    const tStems = candidateStems(t);
    for (const stem of sStems) {
        if (tStems.has(stem)) {
            return true;
        }
    }
    return false;
}

const WORD_TOKEN_RE = /([A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*)/g;

/**
 * 将例句切分为普通文本与命中的目标词/词组片段，供填空卡片渲染。
 */
export function splitClozeSegments(text: string, targetWord: string): ClozeSegment[] {
    const cleanTarget = targetWord.trim();
    if (!text || !cleanTarget) {
        return [{ text, matched: false }];
    }

    const targetWords = cleanTarget
        .split(/\s+/u)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    if (targetWords.length === 0) {
        return [{ text, matched: false }];
    }

    const rawParts = text.split(WORD_TOKEN_RE);
    const wordPositions: number[] = [];
    for (let i = 0; i < rawParts.length; i += 1) {
        if (i % 2 === 1 && rawParts[i].length > 0) {
            wordPositions.push(i);
        }
    }

    const matchedRanges: Array<[number, number]> = [];
    for (let wi = 0; wi <= wordPositions.length - targetWords.length; wi += 1) {
        let matched = true;
        for (let offset = 0; offset < targetWords.length; offset += 1) {
            const partIdx = wordPositions[wi + offset];
            const surface = rawParts[partIdx] ?? '';
            if (!tokensEquivalent(surface, targetWords[offset])) {
                matched = false;
                break;
            }
            if (offset > 0) {
                const prevIdx = wordPositions[wi + offset - 1];
                const gap = rawParts.slice(prevIdx + 1, partIdx).join('');
                if (!/^\s+$/u.test(gap)) {
                    matched = false;
                    break;
                }
            }
        }
        if (matched) {
            const startPartIdx = wordPositions[wi];
            const endPartIdx = wordPositions[wi + targetWords.length - 1];
            matchedRanges.push([startPartIdx, endPartIdx]);
            wi += targetWords.length - 1;
        }
    }

    if (matchedRanges.length === 0) {
        return [{ text, matched: false }];
    }

    const segments: ClozeSegment[] = [];
    let cursor = 0;
    for (const [startIdx, endIdx] of matchedRanges) {
        if (startIdx > cursor) {
            segments.push({ text: rawParts.slice(cursor, startIdx).join(''), matched: false });
        }
        segments.push({ text: rawParts.slice(startIdx, endIdx + 1).join(''), matched: true });
        cursor = endIdx + 1;
    }
    if (cursor < rawParts.length) {
        segments.push({ text: rawParts.slice(cursor).join(''), matched: false });
    }
    return segments;
}
