import { settingsApi } from '@/frontend/features/settings/settingsApi';

/**
 * 将文本写入系统剪贴板。
 *
 * 优先使用主进程 Electron `clipboard.writeText`（Linux Wayland / 非安全上下文下
 * `navigator.clipboard.writeText` 易受权限或焦点限制拒签）；当主进程接口不可用
 * 或调用失败时，再回退到浏览器剪贴板 API。
 *
 * @param text 待复制的纯文本内容。
 */
export async function writeTextToClipboard(text: string): Promise<void> {
    if (typeof settingsApi?.copyText === 'function') {
        try {
            await settingsApi.copyText(text);
            return;
        } catch (ipcError) {
            if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                return;
            }
            throw ipcError;
        }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
    }

    throw new Error('Clipboard API unavailable');
}
