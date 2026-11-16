import type { ApiDefinitions, ApiMap } from '@/common/api/api-def';
import { unwrapIpcError } from '@/common/utils/ipc-error';

/**
 * renderer 调用 main 进程后端接口的统一入口。
 */
export const backendClient = {
    /**
     * 调用后端接口，失败时解包 Electron IPC 错误前缀后交给调用方处理。
     *
     * @param path 后端接口路径。
     * @param params 接口参数。
     * @returns 后端接口返回值。
     */
    call<K extends keyof ApiMap>(
        path: K,
        params?: ApiDefinitions[K]['params'],
    ): Promise<ApiDefinitions[K]['return']> {
        return window.electron.call(path, params).catch((error: unknown) => {
            throw unwrapIpcError(error);
        });
    },
};
