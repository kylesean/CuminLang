import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // 测试与脚手架本身不计入
        'src/**/*.{test,spec}.*',
        'src/test/**',
        'src/mobile/**',
        // 类型与纯常量声明
        'src/**/*.d.ts',
      ],
      // 覆盖率基线（2026-11 实测：lines 62.20% / stmts 61.31% / funcs 57.26% / branches 53.07%，
      // 各留 3–4 个点余量防环境或常规增量抖动）。只防倒退，不虚高卡死常规改动。
      thresholds: {
        lines: 58,
        statements: 57,
        functions: 53,
        branches: 49,
        // 控制器层（薄壳 + IPC 边界）单独设防倒退底线。
        // 2026-11 实测：lines ~66% / stmts ~54% / funcs ~24%（routeContract 覆盖注册链路、
        // registerRoute 测试覆盖校验与日志语义）。
        'src/backend/controllers/**': {
          lines: 60,
          statements: 48,
          functions: 22,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
