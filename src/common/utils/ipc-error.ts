/**
 * 剥离 Electron IPC `ipcMain.handle` 自动附加的错误前缀：
 * `Error invoking remote method '<channel>': <ErrorName>: <message>`。
 */
const ELECTRON_IPC_PREFIX = /^Error invoking remote method '[^']+':\s*(?:([A-Za-z0-9_]*Error):\s*)?/i;

/**
 * 将 IPC 异常消息还原为原始业务报错文本。
 *
 * @param message 原始异常消息。
 * @returns 剥离 Electron IPC 包装前缀后的消息文本。
 */
export function stripIpcErrorPrefix(message: string): string {
    return message.replace(ELECTRON_IPC_PREFIX, '').trim();
}

/**
 * 将经过 Electron `ipcRenderer.invoke` 包装的拒绝异常解包为干净的 `Error`。
 *
 * - 剥离 `Error invoking remote method '<route>': <ErrorName>: ` 前缀，避免界面直接暴露底层 IPC 包装文本；
 * - 保留原始自定义错误名（如 `CancelByUserError`、`AbortError`），确保调用方 `isUserCancellation` 判定不失效。
 *
 * @param error `window.electron.call` 抛出的原始异常。
 * @returns 解包后的 `Error`（若原异常非 `Error` 或不含 IPC 前缀则原样返回）。
 */
export function unwrapIpcError(error: unknown): unknown {
    if (!(error instanceof Error)) {
        return error;
    }
    const match = ELECTRON_IPC_PREFIX.exec(error.message);
    if (!match) {
        return error;
    }
    const extractedName = match[1];
    const strippedMessage = error.message.slice(match[0].length).trim();
    const unwrapped = new Error(strippedMessage || error.message);
    if (error.name && error.name !== 'Error') {
        unwrapped.name = error.name;
    } else if (extractedName && extractedName !== 'Error') {
        unwrapped.name = extractedName;
    }
    if (error.stack) {
        unwrapped.stack = error.stack;
    }
    return unwrapped;
}
