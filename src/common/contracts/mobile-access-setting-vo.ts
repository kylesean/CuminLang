/**
 * 手机访问服务的网络绑定范围。
 *
 * - `'loopback'`：仅监听 `127.0.0.1`，配合端口转发/组网工具使用，不向同一 Wi-Fi 暴露明文 HTTP；
 * - `'lan'`：监听全部网卡，允许同一局域网设备直接访问（明文 HTTP）。
 */
export type MobileAccessBindScope = 'loopback' | 'lan';

/**
 * 手机访问设置详情。
 *
 * 该设置只在主进程生效：开启后会在指定端口监听 HTTP 服务，
 * 供本机转发或同一局域网设备打开手机版页面。
 */
export interface MobileAccessSettingDetailVO {
    /** 用户是否开启手机访问。 */
    enabled: boolean;
    /** 监听端口；配置非法时为 0。 */
    port: number;
    /** 网络绑定范围；默认仅本机回环。 */
    bindScope: MobileAccessBindScope;
    /** HTTP 服务当前是否正在监听。 */
    running: boolean;
    /**
     * 可用的访问地址，形如 http://192.168.1.2:27182/?t=<访问令牌> 或 http://127.0.0.1:27182/?t=<访问令牌>。
     *
     * 地址里带访问令牌是为了让「复制地址」这一步复制出来的链接直接可用；
     * 令牌本身单独放在 accessToken 字段，供界面展示与重新生成。
     */
    lanUrls: string[];
    /** 手机访问令牌；用于鉴权，可随时重新生成使旧地址失效。 */
    accessToken: string;
    /** 最近一次启动失败的原因；没有失败时为 null。 */
    lastError: string | null;
}

/**
 * 手机访问设置保存值。
 */
export interface MobileAccessSettingSaveVO {
    /** 是否开启手机访问。 */
    enabled: boolean;
    /** 监听端口，取值 1-65535。 */
    port: number;
    /** 网络绑定范围；省略时保留当前配置或回退到 `'loopback'`。 */
    bindScope?: MobileAccessBindScope;
}
