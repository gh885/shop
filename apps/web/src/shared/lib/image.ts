/** 图片 URL 拼装：后端图片字段存的是对象存储 key（相对路径，如 product/uuid.webp），展示时拼 CDN 域名。 */

const PREFIX = import.meta.env.VITE_IMAGE_BASE_URL || "https://tkowmtfov.hb-bkt.clouddn.com"

/**
 * key → 公网可访问 URL。兼容两种输入：
 * - 相对 key（product/uuid.webp）→ 拼 CDN 域名
 * - 已是完整 URL（历史存量 http(s)://…）→ 原样返回，不重复拼
 */
export function imgUrl(key?: string): string {
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return key
    return `${PREFIX}/${key}`
}
