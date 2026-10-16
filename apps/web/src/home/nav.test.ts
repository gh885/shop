import { describe, expect, it } from "vite-plus/test"

import { navTitle } from "./nav"

describe("合并标题按宽度预算整组取舍", () => {
    it("预算内的组全部保留_顺序与分隔符原样", () => {
        expect(navTitle("女装 / 男装")).toBe("女装 / 男装")
    })

    it("某一组装不下_它和它之后的整组都不显示，而不是切半字", () => {
        expect(navTitle("连衣裙 / 牛仔裤 / 一二三四五六七八九十")).toBe("连衣裙 / 牛仔裤")
    })

    it("恰好压在预算线上_仍算装得下", () => {
        expect(navTitle("ABCDE / 一二三四五六七八九")).toBe("ABCDE / 一二三四五六七八九")
    })

    it("超预算一个字_那组就不显示", () => {
        expect(navTitle("ABCDE / 一二三四五六七八九十")).toBe("ABCDE")
    })

    it("第一组自己就超预算_也照样显示它，空导航项比缺项更糟", () => {
        const long = "一".repeat(40)
        expect(navTitle(`${long} / 短`)).toBe(long)
    })

    it("单组标题_不加分隔符", () => {
        expect(navTitle("数码")).toBe("数码")
    })

    it("空标题_交出空串而不是报错", () => {
        expect(navTitle("")).toBe("")
    })

    it("预算变窄_取舍跟着变（预算是入参，不是藏在算式里的死数）", () => {
        expect(navTitle("女装 / 男装", 40)).toBe("女装")
    })
})
