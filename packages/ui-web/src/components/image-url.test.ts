import { describe, expect, it } from "vite-plus/test"

import { buildSrcSet, DEFAULT_WIDTHS, withMogr2 } from "./image-url"

/** 钉住两个 CDN 拼装坑：非 http(s) 加不了查询串；URL 自带 query 时须用 & 追加，否则多出的 ? 让七牛只认第一个参数、后续档位全丢 */

const CDN_URL = "https://img.example.com/a.webp"

/** 正向用例取「确实拼出来了」那一条：拼空了就当场炸，而不是把 undefined 比给 toContain */
function srcSetOf(src: string, widths: number[]): string {
    const built = buildSrcSet(src, widths)
    if (built === undefined) throw new Error(`期望拼出 srcset，实际为 undefined：${src}`)
    return built
}

describe("withMogr2", () => {
    it("干净 URL：用 ? 起头拼 thumbnail 档位（只给宽度，等比缩放）", () => {
        expect(withMogr2(CDN_URL, 480)).toBe(`${CDN_URL}?imageMogr2/thumbnail/480x`)
    })

    it("已带 query 的 URL：改用 & 追加，不产出第二个 ?", () => {
        const url = withMogr2(`${CDN_URL}?tenant=1`, 240)

        expect(url).toBe(`${CDN_URL}?tenant=1&imageMogr2/thumbnail/240x`)
        expect(url.split("?")).toHaveLength(2)
    })

    it("http 与 https 一视同仁（七牛测试域名那档是 http）", () => {
        expect(withMogr2("http://a.clouddn.com/x.png", 120)).toBe(
            "http://a.clouddn.com/x.png?imageMogr2/thumbnail/120x",
        )
    })
})

describe("buildSrcSet", () => {
    it("每档一条「处理URL 宽度w」，逗号加空格分隔", () => {
        expect(buildSrcSet(CDN_URL, [120, 240])).toBe(
            `${CDN_URL}?imageMogr2/thumbnail/120x 120w, ${CDN_URL}?imageMogr2/thumbnail/240x 240w`,
        )
    })

    it("档位数组按给定顺序原样产出：拼装既不排序也不去重", () => {
        // 钉「本函数不加第二层保险」：乱序或重复都照抄，浏览器按 w 自己挑
        expect(srcSetOf(CDN_URL, [480, 120, 120])).toBe(
            [480, 120, 120].map((w) => `${CDN_URL}?imageMogr2/thumbnail/${w}x ${w}w`).join(", "),
        )
    })

    it("空档位数组 = 关闭拼接，返回 undefined", () => {
        expect(buildSrcSet(CDN_URL, [])).toBeUndefined()
    })

    it("非 http(s) 源不拼，返回 undefined（不是原样透传）", () => {
        // 非 http(s) 加 ?imageMogr2 只会坏图或拼不出域名；三种都收敛 undefined——落到 <img> 即不带 srcSet，src 仍原值渲染
        expect(buildSrcSet("data:image/png;base64,AAAA", DEFAULT_WIDTHS)).toBeUndefined()
        expect(buildSrcSet("blob:http://localhost/8f2c", DEFAULT_WIDTHS)).toBeUndefined()
        expect(buildSrcSet("product/uuid.webp", DEFAULT_WIDTHS)).toBeUndefined()
    })
})
