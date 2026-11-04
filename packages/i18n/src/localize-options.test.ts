import { describe, expect, it } from "vite-plus/test"

import { localizeStatusOptions } from "./localize-options"

/** 渲染边界换句：只验「把 labelKey 过一遍 t 变成 label、value 原样带过去」这一件事 */
describe("localizeStatusOptions", () => {
    it("逐条把 labelKey 换成句子，value 不动", () => {
        const keyed = [
            { value: "ON", labelKey: "s.on" },
            { value: "OFF", labelKey: "s.off" },
        ] as const
        const fakeT = (key: string) => ({ "s.on": "在售", "s.off": "下架" })[key] ?? key
        expect(localizeStatusOptions(keyed, fakeT)).toEqual([
            { value: "ON", label: "在售" },
            { value: "OFF", label: "下架" },
        ])
    })

    it("返回新数组，不改源选项", () => {
        const keyed = [{ value: "A", labelKey: "k.a" }]
        localizeStatusOptions(keyed, (k) => k.toUpperCase())
        expect(keyed[0]).toEqual({ value: "A", labelKey: "k.a" })
    })
})
