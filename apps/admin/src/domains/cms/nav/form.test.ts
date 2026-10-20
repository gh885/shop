import { describe, expect, it } from "vite-plus/test"

import type { NavEntryResponse } from "@shop/api/sdk"
import { makeNavEntry } from "@shop/test-utils/fixtures"

import { navDefaults, normalizeSubs, SubsSchema, toNavRequest, type SubsValue } from "./form"

const blankForm = () => ({
    navKey: "home",
    title: "手机数码",
    iconKey: "",
    targetType: "NONE" as const,
    target: "",
    sortOrder: "",
})

describe("toNavRequest", () => {
    it("排序空串按 0 解释：后端字段是 int，收不了空串", () => {
        expect(toNavRequest(blankForm(), []).sortOrder).toBe(0)
        expect(toNavRequest({ ...blankForm(), sortOrder: "5" }, []).sortOrder).toBe(5)
    })

    it("剔掉编辑器里的空词条：一个没字的词条在前台是点不动的死链", () => {
        const subs: SubsValue = [{ name: "热门", items: ["手机", "   ", ""] }]

        expect(toNavRequest(blankForm(), subs).subs).toEqual([{ name: "热门", items: ["手机"] }])
    })

    it("整组一条词条都没有：发「没有 items」而不是 items: null（前端契约里缺省 = 无词条）", () => {
        const subs: SubsValue = [{ name: "占位分组", items: ["", "  "] }]

        expect(toNavRequest(blankForm(), subs).subs).toEqual([{ name: "占位分组" }])
    })

    it("没填过的可选字段发缺省：请求体序列化后不带这两个键，空串会被后端当成填了个空值", () => {
        const body = JSON.stringify(toNavRequest(blankForm(), []))

        expect(JSON.parse(body)).toEqual({
            navKey: "home",
            title: "手机数码",
            sortOrder: 0,
            subs: [],
        })
    })
})

describe("navDefaults", () => {
    it("新建时带上进来时的导航位：从哪个位点「新增」就归属哪个位", () => {
        expect(navDefaults(undefined, "home").navKey).toBe("home")
    })

    it("编辑时排序与图标都回填成字符串：数字进不了 input", () => {
        const values = navDefaults(
            makeNavEntry({ sortOrder: 2, iconKey: "smartphone", target: "1001" }),
        )

        expect(values).toMatchObject({ sortOrder: "2", iconKey: "smartphone", target: "1001" })
    })

    it("脏的跳转类型落回 NONE：一个下拉框不认识的类型不该让编辑面打不开", () => {
        expect(navDefaults(makeNavEntry({ targetType: "MINI_PROGRAM" })).targetType).toBe("NONE")
    })
})

describe("normalizeSubs", () => {
    it("响应里缺省的 items 铺成空数组：编辑器要看得见「这组还没填词条」", () => {
        expect(normalizeSubs([{ name: "热门" }])).toEqual([{ name: "热门", items: [] }])
    })

    it("条目本身缺失（新建态、editing 未传）给空列表，而不是 undefined", () => {
        expect(normalizeSubs()).toEqual([])
        expect(normalizeSubs(undefined)).toEqual([])
        expect(normalizeSubs([])).toEqual([])
    })

    it("往返闭合：normalize 再提交，组不丢也不造，词条原样回来", () => {
        const wire: NavEntryResponse["subs"] = [
            { name: "热门", items: ["手机", "平板"] },
            { name: "配件" },
            { name: "其他", items: [] },
        ]

        const resubmitted = toNavRequest(blankForm(), normalizeSubs(wire)).subs

        expect(resubmitted?.map((group) => group.name)).toEqual(["热门", "配件", "其他"])
        expect(resubmitted?.[0]?.items).toEqual(["手机", "平板"])
        expect(resubmitted?.[1]).toEqual({ name: "配件" })
        expect(resubmitted?.[2]).toEqual({ name: "其他" })
    })

    it("编辑器里补回的空行不影响合法性：normalize 出来的状态提交后仍过得了 SubsSchema", () => {
        const value = normalizeSubs([{ name: "热门", items: ["手机"] }, { name: "配件" }])

        expect(SubsSchema.safeParse(toNavRequest(blankForm(), value).subs).success).toBe(true)
    })
})
