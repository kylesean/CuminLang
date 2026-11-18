#!/usr/bin/env node
/**
 * QA 定位器静态检查。
 *
 * 遵循 Playwright 语义定位最佳实践：
 * - 禁止已废弃的非重试句柄 API（`$()` / `$$()`）；
 * - 禁止直接从 `page` / `frame` 根节点发起裸 `.locator(...)` 查询；
 * - 禁止在 `.locator()` 中硬编码 CSS 类名（`.foo`）或 `#id` 选择器。
 *
 * 放行先用 `getByRole` / `getByTestId` / `getByLabel` 语义锚定父容器后，
 * 再对原生无 ARIA 元素（如 `video`、`canvas`、`svg`、`input[type="file"]`）做的局部收窄，
 * 避免模型被迫退回到失去自动等待能力的 `page.evaluate(querySelector)`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QA_ROOT = path.join(REPO_ROOT, 'qa');

/** 需要扫描的目录。 */
const TARGET_DIRS = ['specs', 'support'];

/**
 * 递归列出 `.ts` 文件。
 *
 * @param dir 目录绝对路径。
 * @returns 文件绝对路径数组。
 */
function listTsFiles(dir) {
    const found = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else if (entry.name.endsWith('.ts')) {
                found.push(full);
            }
        }
    }
    return found.sort();
}

const ROOT_LOCATOR_RE = /\b(?:page|frame)\s*\.\s*locator\s*\(/;
const BRITTLE_CSS_SELECTOR_RE = /\.locator\s*\(\s*['"`]\s*[.#]/;
const ELEMENT_HANDLE_RE = /\.\$\$?\s*\(/;

const problems = [];
for (const target of TARGET_DIRS) {
    for (const file of listTsFiles(path.join(QA_ROOT, target))) {
        const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
        // 剥离块注释与单行注释（保留换行与行号对应），避免注释里的示例误报
        const stripped = fs.readFileSync(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
            .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
        const lines = stripped.split('\n');
        lines.forEach((line, index) => {
            if (ELEMENT_HANDLE_RE.test(line)) {
                problems.push(`${relative}:${index + 1} 使用了 $() / $$()，请改用自动等待的语义定位器`);
            } else if (ROOT_LOCATOR_RE.test(line)) {
                problems.push(`${relative}:${index + 1} 直接从 page/frame 根节点调用 .locator()，请改用 getByRole/getByLabel/getByTestId（原生无 ARIA 子元素可在语义父定位器后局部收窄）`);
            } else if (BRITTLE_CSS_SELECTOR_RE.test(line)) {
                problems.push(`${relative}:${index + 1} 在 .locator() 中使用了脆弱的 CSS 类名或 #id，请改用语义定位或 data-testid`);
            }
        });
    }
}

if (problems.length > 0) {
    console.error('QA 定位器检查失败：');
    for (const problem of problems) {
        console.error(`  - ${problem}`);
    }
    process.exit(1);
}

console.log('QA 定位器检查通过：未发现脆弱根定位器或 ElementHandle 调用。');
