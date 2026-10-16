import { describe, expect, it, vi } from "vite-plus/test"

import { formatTimeShort } from "@shop/app-kit/display"

import type { AdminTranslate } from "#/locales/messages.gen"
import { bannerWindowText, subsSummary } from "./display"

vi.stubEnv("TZ", "Asia/Shanghai")

const START = "2026-08-15T09:00:00+08:00"
const END = "2026-08-20T18:00:00+08:00"

type Call = { key: string; params?: Record<string, unknown> }

function recorder() {
    const calls: Call[] = []
    const t = ((key: string, params?: Record<string, unknown>) => {
        calls.push(params === undefined ? { key } : { key, params })
        return params ? `${key} ${JSON.stringify(params)}` : key
    }) as unknown as AdminTranslate
    return { t, calls }
}

describe("bannerWindowText", () => {
    it("两边都没排档期：直接给 nowForever 那条 key，不铺区间", () => {
        const { t, calls } = recorder()
        bannerWindowText(null, null, "zh-Hans-CN", t)
        expect(calls).toEqual([{ key: "cms.display.window.nowForever" }])
    })

    it("只排上线：区间里下线一侧填 forever 的话，不是把 null 格式化成假时刻", () => {
        const { t, calls } = recorder()
        bannerWindowText(START, null, "zh-Hans-CN", t)
        expect(calls).toEqual([
            { key: "cms.display.window.forever" },
            {
                key: "cms.display.window.range",
                params: {
                    from: formatTimeShort(START, "zh-Hans-CN"),
                    to: "cms.display.window.forever",
                },
            },
        ])
    })

    it("只排下线：区间里上线一侧填 now 的话（运营位是存量的、到点自己消失）", () => {
        const { t, calls } = recorder()
        bannerWindowText(null, END, "zh-Hans-CN", t)
        expect(calls).toEqual([
            { key: "cms.display.window.now" },
            {
                key: "cms.display.window.range",
                params: {
                    from: "cms.display.window.now",
                    to: formatTimeShort(END, "zh-Hans-CN"),
                },
            },
        ])
    })

    it("两边都排就是区间，两个槽位都喂格式化后的短时间：不漏 ISO 也不漏 null", () => {
        const { t, calls } = recorder()
        const text = bannerWindowText(START, END, "zh-Hans-CN", t)
        expect(calls).toEqual([
            {
                key: "cms.display.window.range",
                params: {
                    from: formatTimeShort(START, "zh-Hans-CN"),
                    to: formatTimeShort(END, "zh-Hans-CN"),
                },
            },
        ])
        expect(text).not.toContain("null")
    })
})

describe("subsSummary", () => {
    it("组数与词条数各算各的：items 缺省的组按 0 条计，数字作参数出而非拼串", () => {
        const { t, calls } = recorder()
        subsSummary(
            [
                { name: "热门", items: ["手机", "平板"] },
                { name: "配件" },
                { name: "其他", items: [] },
            ],
            t,
        )
        expect(calls).toEqual([{ key: "cms.display.subsSummary", params: { groups: 3, items: 2 } }])
    })

    it("一个分组都没有时报 0 而不是空串：mega 面板没内容也是一条需要看见的事实", () => {
        const { t, calls } = recorder()
        subsSummary([], t)
        expect(calls).toEqual([{ key: "cms.display.subsSummary", params: { groups: 0, items: 0 } }])
    })
})
