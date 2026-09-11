/**
 * 图片 URL 拼装：后端图片字段存的是对象存储 key（相对路径，如 product/uuid.webp），展示时拼 CDN 域名。
 *
 * 三个端（web/seller/admin）展示规则一致，只有域名来源相同，所以这里出「工厂」：
 * 各端在装配处传入自己的构建期变量（app-kit 不读 import.meta.env，保持端与环境无关）。
 *
 * 换域名只改 .env，不改代码；避免把失效/测试域名埋进源码。
 * ⚠ 公网图片域名是强约束：未配置时 imgUrl 返回空串并打一条环境缺配警告，而不是静默出坏图。
 *  - 本地/测试：七牛「测试域名」(*.clouddn.com) 只支持 http（HTTPS 证书不受信任）
 *  - 生产：绑定自有备案 CDN 域名 + 开启 HTTPS，如 https://img.yourdomain.com
 */
export function createImgUrl(rawPrefix: string | undefined) {
    // 配了但写错（非合法 URL）时归一为缺配 ""，走下面的空串告警路径
    const prefix = rawPrefix && /^https?:\/\//i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, "") : ""
    let warnedMissingBase = false

    /**
     * 七牛「测试域名」(*.clouddn.com) 的 HTTPS 证书不受信任，只能 http。
     * 已入库的完整 URL 可能是 https（后端起服务时 publicBaseUrl 配成 https 导致），
     * 这里对这类域名强制回退 http，否则会原样返回无效 https URL 报证书错误。
     * 生产自有域名（https）不受影响。
     */
    function fixTestHostScheme(url: string): string {
        if (/^https:\/\//i.test(url) && /\.clouddn\.com\//i.test(url)) {
            return url.replace(/^https:\/\//i, "http://")
        }
        return url
    }

    /**
     * key → 公网可访问 URL。兼容两种输入：
     * - 相对 key（product/uuid.webp）→ 拼 CDN 域名
     * - 已是完整 URL（历史存量 http(s)://…）→ 原样返回，不重复拼
     */
    return function imgUrl(key?: string): string {
        if (!key) return ""
        if (/^https?:\/\//i.test(key)) return fixTestHostScheme(key) // 已是完整 URL（历史存量）
        if (!prefix) {
            // 强约束：图片字段存的是相对 key，没配公网域名就拼不出可访问 URL——提示而不是静默返回坏图
            if (!warnedMissingBase) {
                warnedMissingBase = true
                console.warn(
                    "[imgUrl] VITE_IMAGE_BASE_URL 未配置：无法拼接图片公网 URL。请在 .env 设置（测试域名 http，生产自有域名 https）。",
                )
            }
            return ""
        }
        return `${prefix}/${key}`
    }
}
