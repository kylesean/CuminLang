import i18next from 'i18next';
import {
    createBundleTranslator,
    translateBackendMessage,
    type ErrorTranslateFn,
} from '@/common/i18n/backendErrorMatcher';
import enErrors from '@/frontend/i18n/locales/en-US/errors.json';
import zhErrors from '@/frontend/i18n/locales/zh-CN/errors.json';
import enToast from '@/frontend/i18n/locales/en-US/toast.json';
import zhToast from '@/frontend/i18n/locales/zh-CN/toast.json';

const zhErrorTranslate = createBundleTranslator(zhErrors as Record<string, unknown>);
const enErrorTranslate = createBundleTranslator(enErrors as Record<string, unknown>);

/** 解析当前激活的界面语言是否为简体中文（不触发 `i18n/index.ts` 副作用初始化）。 */
export function isChineseUiLocale(): boolean {
    const active = i18next.resolvedLanguage ?? i18next.language ?? (typeof navigator !== 'undefined' ? navigator.language : '');
    return active.toLowerCase().startsWith('zh');
}

const defaultTranslate: ErrorTranslateFn = (key, params) => {
    const translate = isChineseUiLocale() ? zhErrorTranslate : enErrorTranslate;
    return translate(key, params);
};

/** 供全局通知使用的本地化标题（错包与提示）。 */
export function getLocalizedToastTitle(kind: 'error' | 'info'): string {
    const isZh = isChineseUiLocale();
    if (kind === 'error') {
        return isZh ? zhErrors.title : enErrors.title;
    }
    return isZh ? zhToast.infoTitle : enToast.infoTitle;
}

/**
 * 将主进程返回的错误/状态文本按当前界面语言翻译；未知文本保持原样，
 * 避免吞掉底层异常细节。
 */
export function localizeBackendMessage(
    message: string,
    translate: ErrorTranslateFn = defaultTranslate,
): string {
    return translateBackendMessage(message, translate);
}

/**
 * 本地化 `Error` 实例的 `message` 并保留 `name` 与 `stack`（供 `isUserCancellation` 等判定继续生效）。
 */
export function localizeBackendError(
    error: unknown,
    translate: ErrorTranslateFn = defaultTranslate,
): unknown {
    if (!(error instanceof Error)) {
        if (typeof error === 'string') {
            return localizeBackendMessage(error, translate);
        }
        return error;
    }
    const localizedMessage = localizeBackendMessage(error.message, translate);
    if (localizedMessage === error.message) {
        return error;
    }
    const localized = new Error(localizedMessage);
    if (error.name && error.name !== 'Error') {
        localized.name = error.name;
    }
    if (error.stack) {
        localized.stack = error.stack;
    }
    if ('cause' in error && error.cause !== undefined) {
        localized.cause = error.cause;
    }
    return localized;
}

/**
 * 若接口返回值属于 `{ success, message }` 结果信封，就地返回带本地化 `message` 的浅拷贝。
 */
export function localizeBackendResult<T>(
    result: T,
    translate: ErrorTranslateFn = defaultTranslate,
): T {
    if (
        result
        && typeof result === 'object'
        && 'success' in result
        && 'message' in result
        && typeof (result as { success?: unknown }).success === 'boolean'
        && typeof (result as { message?: unknown }).message === 'string'
    ) {
        const current = result as { success: boolean; message: string };
        const localized = localizeBackendMessage(current.message, translate);
        if (localized !== current.message) {
            return { ...current, message: localized } as unknown as T;
        }
    }
    return result;
}
