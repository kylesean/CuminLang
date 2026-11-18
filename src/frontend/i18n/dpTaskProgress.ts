import type { DpTaskProgressMeta } from '@/common/contracts/dp-task';
import i18n from '@/frontend/i18n';
import { localizeBackendMessage } from '@/frontend/i18n/backendErrorLocalizer';

export interface DpTaskProgressSnapshot {
    progress?: string | null;
    progressMeta?: DpTaskProgressMeta | null;
}

/**
 * 将 `dp-task` 的结构化 `progressMeta` 解析为当前界面语言的进度文案；
 * 未知或缺失元数据时回退到 `progress` 文本（并经过后端消息本地化）。
 */
export function formatDpTaskProgress(
    task: DpTaskProgressSnapshot | 'init' | null | undefined,
): string | null {
    if (!task || task === 'init') {
        return null;
    }
    const meta = task.progressMeta;
    if (meta?.code) {
        const key = `common:dpTask.stages.${meta.code}`;
        if (i18n.exists(key)) {
            const interpolation = {
                ...(meta.params ?? {}),
                ...(typeof meta.percent === 'number' ? { percent: meta.percent } : {}),
            };
            return i18n.t(key, interpolation);
        }
    }
    return task.progress ? localizeBackendMessage(task.progress) : null;
}
