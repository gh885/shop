/** 图片 srcset 的 URL 拼装（纯函数，不碰 DOM/React）。从 image.tsx 抽出：这三段是七牛下载处理参数的拼装规则，与组件皮肤无关，抽出后可不起浏览器就断言档位排布 */

/** srcset 默认生成的处理宽度档（px）。七牛 thumbnail 只缩不放，超出原图宽度的档位无害退化为原图 */
export const DEFAULT_WIDTHS = [120, 240, 480, 960, 1440]

/** 拼七牛下载处理参数；URL 已带 query 时用 & 追加 */
export function withMogr2(url: string, width: number): string {
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}imageMogr2/thumbnail/${width}x`
}

/** http(s) 才拼 srcset（dataURL/blob 本地预览加不了查询串）；widths 为空即关闭 */
export function buildSrcSet(src: string, widths: number[]): string | undefined {
    if (widths.length === 0 || !/^https?:\/\//i.test(src)) return undefined
    return widths.map((w) => `${withMogr2(src, w)} ${w}w`).join(", ")
}
