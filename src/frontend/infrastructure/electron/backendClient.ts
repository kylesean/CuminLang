import type { ApiDefinitions, ApiMap } from '@/common/api/api-def';
import { unwrapIpcError } from '@/common/utils/ipc-error';
import {
    localizeBackendError,
    localizeBackendResult,
} from '@/frontend/i18n/backendErrorLocalizer';

/**
 * renderer 调用 main 进程后端接口的统一入口。
 */
export const backendClient = {
    /**
     * 调用后端接口，成功时本地化状态信封文案，失败时解包并本地化错误后交给调用方处理。
     *
     * @param path 后端接口路径。
     * @param params 接口参数。
     * @returns 后端接口返回值。
     */
    call<K extends keyof ApiMap>(
        path: K,
        params?: ApiDefinitions[K]['params'],
    ): Promise<ApiDefinitions[K]['return']> {
        return window.electron.call(path, params)
            .then((result) => localizeBackendResult(result))
            .catch((error: unknown) => {
                throw localizeBackendError(unwrapIpcError(error));
            });
    },
};
