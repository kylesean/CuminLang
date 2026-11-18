import { SECRET_SETTING_KEYS } from '@/common/types/store_schema';

const ENCRYPTED_PREFIX = 'dp-enc:';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactSecretValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length > 0 && !value.startsWith(ENCRYPTED_PREFIX)) {
        return `[redacted:${value.length}]`;
    }
    return value;
}

function redactNestedPath(root: Record<string, unknown>, dottedKey: string): void {
    // electron-store 默认将带点号键拆分为嵌套 JSON 对象，同时也兼容直接以点号为键名的扁平形态。
    if (Object.prototype.hasOwnProperty.call(root, dottedKey)) {
        root[dottedKey] = redactSecretValue(root[dottedKey]);
    }
    const segments = dottedKey.split('.');
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
        const next = cursor[segments[i]];
        if (!isPlainRecord(next)) {
            return;
        }
        cursor = next;
    }
    const leaf = segments[segments.length - 1];
    if (Object.prototype.hasOwnProperty.call(cursor, leaf)) {
        cursor[leaf] = redactSecretValue(cursor[leaf]);
    }
}

/**
 * 脱敏 `electron-store` 配置快照，覆盖全部 `SECRET_SETTING_KEYS` 明文（含无密钥环回退的明文场景），
 * 防止失败留证 artifact 泄漏 API Key、代理认证信息或局域网访问令牌。
 */
export function redactConfigSnapshot(raw: unknown): unknown {
    if (!isPlainRecord(raw)) {
        return raw;
    }
    const clone = structuredClone(raw);
    for (const secretKey of SECRET_SETTING_KEYS) {
        redactNestedPath(clone, secretKey);
    }
    // 兜底脱敏 apiKeys 子树下可能出现的新增或历史 `.key` 字段。
    if (isPlainRecord(clone.apiKeys)) {
        for (const entry of Object.values(clone.apiKeys)) {
            if (isPlainRecord(entry) && Object.prototype.hasOwnProperty.call(entry, 'key')) {
                entry.key = redactSecretValue(entry.key);
            }
        }
    }
    return clone;
}
