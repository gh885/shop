import { describe, expect, it } from "vite-plus/test"

import type { NavEntryResponse } from "@shop/api/sdk"
import { makeNavEntry } from "@shop/test-utils/fixtures"

import { navDefaults, normalizeSubs, SubsSchema, toNavRequest, type SubsValue } from "./form"

/**
 * nav 表单 → NavRequest，重点是 subs（JSONB 里组/项两级的整段配置）。
 *
 * subs 的表单态和提交态不是一回事：编辑器里每行都是一个空 input（字符串 `""`），
 * 提交时它们必须消失，否则前台会渲染出一个没有字的分组或一条点不动的词条。
 */

const blankForm = () => ({
    navKey: "home",
    title: "手机数码",
    iconKey: "",
    targetType: "NONE" as const,
    target: "",
    sortOrder: "",
})

describe("toNavRequest", () => {
    // 「不跳转」发缺省不在这里单独钉：下面那条对序列化后的完整请求做相等断言，
    // 真发了 targetType: "NONE" 照样会红
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
        // 这三个字段是这条用例的考察对象，所以显式写出来：共用夹具的默认值是中性档（无跳转），
        // 依赖它就等于把「默认值恰好是 2/smartphone」这件事藏起来
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
        // 空词条在提交时消失：整组没词条发「没有 items」，那是前端的缺省语义（见 toNavRequest）
        expect(resubmitted?.[1]).toEqual({ name: "配件" })
        expect(resubmitted?.[2]).toEqual({ name: "其他" })
    })

    it("编辑器里补回的空行不影响合法性：normalize 出来的状态提交后仍过得了 SubsSchema", () => {
        const value = normalizeSubs([{ name: "热门", items: ["手机"] }, { name: "配件" }])

        expect(SubsSchema.safeParse(toNavRequest(blankForm(), value).subs).success).toBe(true)
    })
})
