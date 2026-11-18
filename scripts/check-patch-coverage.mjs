#!/usr/bin/env node
/**
 * 补丁覆盖率门禁：本次变更在受门禁目录内触碰的新增/修改语句，覆盖率必须达标。
 *
 * 与 vitest.config.ts 的 per-glob 阈值互补：全局阈值防「整层覆盖率倒退」，
 * 本脚本基于 `git diff -U0` 只检查本次补丁触碰到的可执行语句（以及缺失覆盖条目的新文件），
 * 既避免整行区间涂色掩盖未测分支，也不让存量文件成为绕过缓冲或误伤已测改动的噪声。
 *
 * 数据来源：vitest v8 provider 产出的 istanbul 格式 coverage/coverage-final.json
 * （CI 在 Unit tests 步骤用 test:coverage 生成；本地请先跑 pnpm run test:coverage）。
 *
 * 用法：node scripts/check-patch-coverage.mjs [--base <git-ref>] [--coverage <path>]
 *   --base     diff 基线（默认 origin/main）；基线不可解析时跳过并放行（CI 首推等场景）。
 *   --coverage 覆盖率 JSON 路径（默认 coverage/coverage-final.json）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * 分层补丁阈值：前缀命中的变更文件按该补丁语句覆盖率底线把关。
 */
const PATCH_RULES = [
    { prefix: 'src/backend/controllers/', statements: 55 },
];

/** 解析命令行参数。 */
function parseArgs(argv) {
    const args = { base: 'origin/main', coverage: 'coverage/coverage-final.json' };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--') continue;
        else if (argv[i] === '--base') args.base = argv[++i];
        else if (argv[i] === '--coverage') args.coverage = argv[++i];
        else {
            console.error(`未知参数：${argv[i]}`);
            process.exit(2);
        }
    }
    return args;
}

/** 执行 git 命令并返回 stdout；失败时返回 null。 */
function git(args) {
    try {
        return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

/**
 * 计算单文件起始行覆盖率（与 Istanbul/Vitest 同口径：按每条语句的 start.line 聚合，
 * 取同行的最大命中次数，不用整块 [start..end] 区间把外层 class/函数涂绿）。
 *
 * @param {object} entry coverage-final.json 中单文件的覆盖率条目。
 * @returns {number} 0–100 的百分比。
 */
export function startLineCoverage(entry) {
    const lineMaxHits = new Map();
    for (const [id, loc] of Object.entries(entry.statementMap ?? {})) {
        const line = loc?.start?.line;
        if (typeof line !== 'number') continue;
        const count = entry.s?.[id] ?? 0;
        const prev = lineMaxHits.get(line) ?? 0;
        lineMaxHits.set(line, Math.max(prev, count));
    }
    if (lineMaxHits.size === 0) return 100;
    let hit = 0;
    for (const count of lineMaxHits.values()) {
        if (count > 0) hit += 1;
    }
    return (hit / lineMaxHits.size) * 100;
}

/**
 * 从 unified diff (`git diff -U0`) 提取各文件新增/修改的目标行号集合。
 *
 * @param {string} diffText `git diff -U0` 输出文本。
 * @returns {Map<string, Set<number>>} 仓库相对路径 -> 修改后行号集合。
 */
export function parseDiffAddedLines(diffText) {
    const byFile = new Map();
    let currentFile = null;
    for (const rawLine of diffText.split('\n')) {
        if (rawLine.startsWith('+++ b/')) {
            currentFile = rawLine.slice('+++ b/'.length).trim();
            if (!byFile.has(currentFile)) {
                byFile.set(currentFile, new Set());
            }
            continue;
        }
        if (rawLine.startsWith('+++ /dev/null')) {
            currentFile = null;
            continue;
        }
        if (!currentFile) continue;
        const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (!hunkMatch) continue;
        const start = Number(hunkMatch[1]);
        const count = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
        const lineSet = byFile.get(currentFile);
        for (let line = start; line < start + count; line += 1) {
            lineSet.add(line);
        }
    }
    return byFile;
}

/**
 * 计算某次 diff 触碰到的语句覆盖率；若文件中没有位于修改行上的可执行语句则返回 null。
 *
 * 跳过覆盖整文件或上百行的外层容器语句（`end.line - start.line > 2` 且 `start.line` 不在修改行中），
 * 只统计 `start.line` 明确落在修改行内的语句。
 *
 * @param {object | undefined} entry coverage-final.json 中单文件的覆盖率条目。
 * @param {Set<number>} addedLines 该文件本次新增/修改的行号集合。
 * @returns {{ pct: number, total: number, hit: number } | null} 命中统计；文件缺失覆盖条目时返回 0%。
 */
export function patchStatementCoverage(entry, addedLines) {
    if (!entry) {
        return { pct: 0, total: 0, hit: 0, missingEntry: true };
    }
    if (!addedLines || addedLines.size === 0) {
        return null;
    }
    const touchedIds = [];
    for (const [id, loc] of Object.entries(entry.statementMap ?? {})) {
        const startLine = loc?.start?.line;
        if (typeof startLine === 'number' && addedLines.has(startLine)) {
            touchedIds.push(id);
        }
    }
    if (touchedIds.length === 0) {
        return null;
    }
    let hit = 0;
    for (const id of touchedIds) {
        if ((entry.s?.[id] ?? 0) > 0) hit += 1;
    }
    return {
        pct: (hit / touchedIds.length) * 100,
        total: touchedIds.length,
        hit,
        missingEntry: false,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = git(['rev-parse', '--show-toplevel']);
    if (!repoRoot) {
        console.error('补丁覆盖率：无法定位 git 仓库根目录');
        process.exit(2);
    }

    // 基线不可解析（CI 首次推送的 0000 占位、浅克隆缺历史等）→ 跳过，不拦正常流水线。
    const baseCommit = git(['rev-parse', '--verify', `${args.base}^{commit}`]);
    if (!baseCommit) {
        console.log(`补丁覆盖率：基线 ${args.base} 不可解析，跳过检查`);
        process.exit(0);
    }

    const changedFiles = git(['diff', '--name-only', `${baseCommit}...HEAD`, '--', 'src/'])
        ?.split('\n')
        // 测试/规格文件自身不计入覆盖率统计（vitest coverage exclude 同口径），
        // 不排除的话「缺失 = 0%」规则会误伤它们。
        .filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
        .filter(Boolean) ?? [];
    if (changedFiles.length === 0) {
        console.log('补丁覆盖率：src/ 无变更，跳过检查');
        process.exit(0);
    }

    const coveragePath = path.resolve(repoRoot, args.coverage);
    if (!fs.existsSync(coveragePath)) {
        console.error(`补丁覆盖率：未找到 ${args.coverage}，请先运行 pnpm run test:coverage`);
        process.exit(2);
    }
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));

    const diffText = git(['diff', '-U0', `${baseCommit}...HEAD`, '--', ...PATCH_RULES.map((r) => r.prefix)]) ?? '';
    const addedLinesByFile = parseDiffAddedLines(diffText);

    const violations = [];
    const checked = [];
    for (const rule of PATCH_RULES) {
        const touchedFiles = changedFiles.filter((file) => file.startsWith(rule.prefix));
        for (const file of touchedFiles) {
            const absolute = path.resolve(repoRoot, file);
            const entry = coverage[absolute];
            const addedLines = addedLinesByFile.get(file) ?? new Set();
            const patchStat = patchStatementCoverage(entry, addedLines);
            if (!patchStat) {
                const fileLinePct = entry ? startLineCoverage(entry) : 0;
                checked.push(`${file} 补丁无新增可执行语句（文件行 ${fileLinePct.toFixed(1)}%）`);
                continue;
            }
            if (patchStat.missingEntry) {
                checked.push(`${file} 0.0%（未生成覆盖率记录）`);
                violations.push(`${file} 未被测试覆盖（0.0% < ${rule.statements}%）`);
                continue;
            }
            checked.push(`${file} 补丁语句 ${patchStat.pct.toFixed(1)}%（${patchStat.hit}/${patchStat.total}）`);
            if (patchStat.pct < rule.statements) {
                violations.push(
                    `${file} 补丁语句覆盖率 ${patchStat.pct.toFixed(1)}%（${patchStat.hit}/${patchStat.total}）低于 ${rule.statements}%`,
                );
            }
        }
    }

    if (checked.length === 0) {
        console.log('补丁覆盖率：本次变更未触碰受门禁的目录，通过');
        process.exit(0);
    }

    console.log(`补丁覆盖率（基线 ${args.base}）：`);
    for (const line of checked) console.log(`  ${line}`);

    if (violations.length > 0) {
        console.error('\n补丁覆盖率不达标：');
        for (const line of violations) console.error(`  ${line}`);
        process.exit(1);
    }
    console.log('补丁覆盖率门禁通过');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    main();
}
