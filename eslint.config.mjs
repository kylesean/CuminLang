import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import playwright from 'eslint-plugin-playwright';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'vite.*.config.ts',
            // astryx theme build 的产物（.js / .d.ts / variants），由主题源文件编译生成，不参与源码 lint
            'src/themes/**/*.js',
            'src/themes/**/*.d.ts',
            'node_modules/**',
            '.vite/**',
            'out/**',
            '**/*.md',
            'dist/**',
            'build/**',
            // Playwright 运行产物（trace viewer 等打包脚本），由 E2E 自动生成，不参与源码 lint
            'qa/playwright-report/**',
            'qa/playwright-report-packaged/**',
            'qa/test-results/**',
            'qa/test-results-packaged/**',
            'qa/fixtures/media/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    importX.flatConfigs.recommended,
    importX.flatConfigs.electron,
    importX.flatConfigs.typescript,
    reactPlugin.configs.flat.recommended,
    reactPlugin.configs.flat['jsx-runtime'],
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2025,
            },
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: './tsconfig.json',
                }),
                importX.createNodeResolver(),
            ],
            react: {
                version: 'detect',
            },
        },
        rules: {
            'no-mixed-spaces-and-tabs': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',
            'jsx-a11y/anchor-is-valid': 'warn',
            'jsx-a11y/click-events-have-key-events': 'warn',
            'jsx-a11y/mouse-events-have-key-events': 'warn',
            'jsx-a11y/no-static-element-interactions': 'warn',
            'jsx-a11y/no-noninteractive-tabindex': 'warn',
            'jsx-a11y/label-has-associated-control': 'warn',
            'jsx-a11y/alt-text': 'warn',
        },
    },
    {
        // 功能模块内禁止直接调用底层跨进程客户端，也不允许引入测试资产。
        files: ['src/frontend/features/**/*.{ts,tsx}'],
        ignores: ['src/frontend/features/**/*Api.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@/frontend/infrastructure/electron/backendClient',
                            message: '业务调用请收口到当前 feature 的 *Api.ts 文件。',
                        },
                        {
                            name: 'lucide-react',
                            importNames: ['Sparkles', 'Wand', 'Wand2'],
                            message: '禁止使用泛化“AI 魔法星光/仙女棒”陈词图标，请按真实业务动作选用图标（见 docs/DESIGN.md §5.0）。',
                        },
                    ],
                    patterns: [
                        {
                            group: ['qa/**', '../qa/**', '../../qa/**', '../../../qa/**'],
                            message: '产品代码不许 import qa/ 下的用例资产。',
                        },
                    ],
                },
            ],
        },
    },
    {
        // 非功能模块源码禁止引入端到端测试目录下的文件。
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/frontend/features/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'lucide-react',
                            importNames: ['Sparkles', 'Wand', 'Wand2'],
                            message: '禁止使用泛化“AI 魔法星光/仙女棒”陈词图标，请按真实业务动作选用图标（见 docs/DESIGN.md §5.0）。',
                        },
                    ],
                    patterns: [
                        {
                            group: ['qa/**', '../qa/**', '../../qa/**', '../../../qa/**'],
                            message: '产品代码不许 import qa/ 下的用例资产。',
                        },
                    ],
                },
            ],
        },
    },
    {
        ...playwright.configs['flat/recommended'],
        files: ['qa/**/*.ts'],
        rules: {
            ...playwright.configs['flat/recommended'].rules,
            // 合法跨平台守卫（如 Windows/root 跳过 chmod 权限校验）使用条件 test.skip(cond, reason)
            'playwright/no-skipped-test': ['error', { allowConditional: true }],
            // 局部子元素定位（如原生 <video>）与语义定位器协同工作，避免被迫退回 page.evaluate(querySelector)
            'playwright/prefer-native-locators': 'off',
            // 允许合法的平台分支（如 !isMac）与夹具构造；禁止“吞掉断言的条件分支”交由评审控制
            'playwright/no-conditional-in-test': 'off',
            'playwright/no-conditional-expect': 'off',
            // POM、fixture 与工具层只封装操作与读取，不在辅助层写断言
            'playwright/expect-expect': 'off',
        },
    },
    {
        files: ['qa/specs/**/*.spec.ts'],
        ignores: ['qa/specs/player/player-scroll-anchor.spec.ts'],
        rules: {
            'playwright/expect-expect': 'warn',
        },
    },
    {
        // 滚动锚定差分实验需要观察虚拟列表惯性回落窗口，保留定量时间采样
        files: ['qa/specs/player/player-scroll-anchor.spec.ts'],
        rules: {
            'playwright/no-wait-for-timeout': 'off',
        },
    },
    {
        // 端到端测试只能引用公共层类型与常量，不允许耦合产品内部实现。
        files: ['qa/**/*.{ts,tsx,mjs,js}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'lucide-react',
                            importNames: ['Sparkles', 'Wand', 'Wand2'],
                            message: '禁止使用泛化“AI 魔法星光/仙女棒”陈词图标，请按真实业务动作选用图标（见 docs/DESIGN.md §5.0）。',
                        },
                    ],
                    patterns: [
                        {
                            group: [
                                '@/frontend',
                                '@/frontend/**',
                                '@/backend',
                                '@/backend/**',
                                '@/app',
                                '@/app/**',
                                '@/test',
                                '@/test/**',
                            ],
                            message:
                                'qa/ 只依赖 @/common 的类型与常量：运行期契约走 window.__dpDebug 与 URL 参数，不许直接读产品内部实现（产品一重构，用例就跟着烂）。',
                        },
                        {
                            group: [
                                '**/src/frontend/**',
                                '**/src/backend/**',
                                '**/src/app/**',
                                '**/src/test/**',
                            ],
                            message: 'qa/ 不许用相对路径绕到 src 的内部实现；只允许 ../../src/common/**。',
                        },
                    ],
                },
            ],
            'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
            'react-hooks/rules-of-hooks': 'off',
        },
    },
    {
        // 单元测试禁止遗留独占聚焦调用或无条件跳过。
        files: ['src/**/__tests__/**/*.{ts,tsx,js,jsx}', 'src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='only']",
                    message: '禁止提交 describe.only / it.only / test.only，调试完请移除。',
                },
                {
                    selector:
                        "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='skip']",
                    message: '禁止无条件 describe.skip / it.skip / test.skip；环境门控请使用 skipIf(condition)。',
                },
            ],
        },
    },
);
