/** 图片 URL 拼装：后端图片字段存的是对象存储 key（相对路径，如 product/uuid.webp），展示时拼 CDN 域名。 */

/**
 * 公网图片域名：**只读环境变量，不硬编码**（图片字段存的是 key，必须配公网域名才能拼出可访问 URL）。
 *
 * ⚠ 未配置时 imgUrl 会返回空串并打一条环境缺配警告（见 imgUrl），强约束在 .env 显式填写：
 *  - 本地/测试：七牛「测试域名」(*.clouddn.com) 只支持 http（HTTPS 证书不受信任，ERR_CERT_COMMON_NAME_INVALID），
 *    如 VITE_IMAGE_BASE_URL=http://tkowmtfov.hb-bkt.clouddn.com
 *  - 生产：绑定自有备案 CDN 域名 + 开启 HTTPS，如 VITE_IMAGE_BASE_URL=https://img.yourdomain.com
 *
 * 换域名只改 .env，不改代码；避免把失效/测试域名埋进源码。
 */
const PREFIX = import.meta.env.VITE_IMAGE_BASE_URL

let warnedMissingBase = false

/**
 * key → 公网可访问 URL。兼容两种输入：
 * - 相对 key（product/uuid.webp）→ 拼 CDN 域名
 * - 已是完整 URL（历史存量 http(s)://…）→ 原样返回，不重复拼
 */
/**
 * 七牛「测试域名」(*.clouddn.com) 的 HTTPS 证书不受信任，只能 http。
 * 已入库的完整 URL 可能是 https（后端起服务时 publicBaseUrl 配成 https 导致），
 * 这里对这类域名强制回退 http，否则 imgUrl 会原样返回无效 https URL 报证书错误。
 * 生产自有域名（https）不受影响。
 */
function fixTestHostScheme(url: string): string {
    if (/^https:\/\//i.test(url) && /\.clouddn\.com\//i.test(url)) {
        return url.replace(/^https:\/\//i, "http://")
    }
    return url
}

export function imgUrl(key?: string): string {
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return fixTestHostScheme(key) // 已是完整 URL（历史存量）
    if (!PREFIX) {
        // 强约束：图片字段存的是相对 key，没配公网域名就拼不出可访问 URL——提示而不是静默返回坏图
        if (!warnedMissingBase) {
            warnedMissingBase = true
            console.warn(
                "[imgUrl] VITE_IMAGE_BASE_URL 未配置：无法拼接图片公网 URL。请在 .env 设置（测试域名 http，生产自有域名 https）。",
            )
        }
        return ""
    }
    return `${PREFIX}/${key}`
}
