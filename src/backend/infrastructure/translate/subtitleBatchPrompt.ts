import { z } from 'zod';

/**
 * 批量字幕翻译的提示词模板与结构化输出约定。
 */

type BatchPromptItem = {
    key: string;
    text: string;
};

type SubtitleBatchPromptInput = {
    targets: BatchPromptItem[];
    contextBefore: BatchPromptItem[];
    contextAfter: BatchPromptItem[];
};

type SubtitleBatchPromptOptions = {
    forbidEcho?: boolean;
};

const OPENAI_SUBTITLE_BATCH_PROMPT = `You are a professional subtitle translation assistant.

Follow these style guidelines closely:
{{style}}

You will receive target subtitle lines and optional surrounding context in JSON format.
Context lines (contextBefore and contextAfter) are READ-ONLY references to help understand tone, intent, and terminology.

Rules:
1. Return exactly one translation for every item in targets.
2. Copy every target key exactly; never change, omit, duplicate, or invent keys.
3. NEVER translate, include, or return contextBefore or contextAfter items.
4. Do not merge or split target lines.
{{unchangedRule}}6. Respond with valid JSON only in the following shape:
{"items":[{"key":"target_key","translation":"translated_text"}]}

Subtitle request:
{{request}}`;

/**
 * 生成字幕窗口批量翻译提示词。
 */
export const buildSubtitleBatchPrompt = (
    input: SubtitleBatchPromptInput,
    style: string,
    options: SubtitleBatchPromptOptions = {},
): string => {
    const unchangedRule = options.forbidEcho
        ? '5. Every translation must be a non-empty translation into the target language described for the translation field. NEVER return the original sentence text as its own translation.\n'
        : '5. Every translation must be a non-empty string. If a target should remain unchanged, return its original text.\n';
    return OPENAI_SUBTITLE_BATCH_PROMPT
        .replace(/{{\s*unchangedRule\s*}}/gi, unchangedRule)
        .replace(/{{\s*style\s*}}/gi, style)
        .replace(/{{\s*request\s*}}/gi, JSON.stringify(input, null, 2));
};

/**
 * 构建批量字幕结果的结构化输出 schema。
 */
export const createSubtitleBatchResultSchema = () =>
    z.object({
        items: z.array(z.object({
            key: z.string().describe('Original subtitle key.'),
            translation: z.string().describe('The translated sentence in Simplified Chinese.'),
        })),
    });
