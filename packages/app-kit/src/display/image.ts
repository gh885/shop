/**
 * 图片 URL 拼装：后端存对象存储 key，展示时拼 CDN 域名。出「工厂」让各端在装配处传自己的构建期变量（app-kit 不读 import.meta.env，端/环境无关）。
 * ⚠ 公网域名是强约束：未配置时 imgUrl 返回空串 + 一条缺配警告，不静默出坏图。
 */
/** 七牛测试域名 *.clouddn.com 证书不受信、只能 http：对这类已入库的 https 完整 URL 强制回退 http，否则报证书错误（生产自有域名不受影响） */
function fixTestHostScheme(url: string): string {
    if (/^https:\/\//i.test(url) && /\.clouddn\.com\//i.test(url)) {
        return url.replace(/^https:\/\//i, "http://")
    }
    return url
}

export function createImgUrl(rawPrefix: string | undefined) {
    // 配了但写错（非合法 URL）时归一为缺配 ""，走下面的空串告警路径
    const prefix = rawPrefix && /^https?:\/\//i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, "") : ""
    let warnedMissingBase = false

    /** key → 公网可访问 URL：相对 key 拼 CDN 域名，已是完整 URL（历史存量）原样返回不重复拼 */
    return function imgUrl(key?: string): string {
        if (!key) return ""
        if (/^https?:\/\//i.test(key)) return fixTestHostScheme(key)
        if (!prefix) {
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
