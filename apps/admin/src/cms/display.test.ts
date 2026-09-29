import { describe, expect, it, vi } from "vite-plus/test"

import { formatTimeShort } from "@shop/app-kit"

import { bannerWindowText, subsSummary } from "./display"

/**
 * CMS 列表那两格文案的规则。短时间格式本身归 app-kit（三个端共用一份），
 * 这里钉的是「哪一侧缺值就说哪一侧的话」——生效窗口少排一边时，界面上必须写「立即 / 长期」，
 * 而不是留一个空半边让人以为这条运营位的档期数据坏了。
 */
vi.stubEnv("TZ", "Asia/Shanghai")

const START = "2026-08-15T09:00:00+08:00"
const END = "2026-08-20T18:00:00+08:00"

describe("bannerWindowText", () => {
    it("两边都没排档期：一句「立即 · 长期」，中间那个点把它和「~」的区间形状区分开", () => {
        expect(bannerWindowText(null, null, "zh-CN")).toBe("立即 · 长期")
    })

    it("只排上线：下线那一侧说「长期」，不能把 null 格式化成一个真实时刻", () => {
        expect(bannerWindowText(START, null, "zh-CN")).toBe(
            `${formatTimeShort(START, "zh-CN")} ~ 长期`,
        )
    })

    it("只排下线：上线那一侧说「立即」，运营位是存量的、到点自己消失", () => {
        expect(bannerWindowText(null, END, "zh-CN")).toBe(`立即 ~ ${formatTimeShort(END, "zh-CN")}`)
    })

    it("两边都排就是区间，且不会把 ISO 原文漏到界面上", () => {
        const text = bannerWindowText(START, END, "zh-CN")

        expect(text).toBe(`${formatTimeShort(START, "zh-CN")} ~ ${formatTimeShort(END, "zh-CN")}`)
        expect(text).not.toContain("T")
        expect(text).not.toContain("null")
    })
})

describe("subsSummary", () => {
    it("组数与词条数各算各的：items 缺省的组按 0 条计，不给整列报出 undefined", () => {
        expect(
            subsSummary([
                { name: "热门", items: ["手机", "平板"] },
                { name: "配件" },
                { name: "其他", items: [] },
            ]),
        ).toBe("3 组 / 2 项")
    })

    it("一个分组都没有时报 0 而不是空串：mega 面板没内容也是一条需要看见的事实", () => {
        expect(subsSummary([])).toBe("0 组 / 0 项")
    })
})
