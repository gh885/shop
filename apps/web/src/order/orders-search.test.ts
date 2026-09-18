import { describe, expect, it } from "vitest"

import {
    outOfRangePage,
    parseOrdersSearch,
    type OrdersSearch,
    type OrdersSearchInput,
} from "./orders-search"

/** URL 运行时只有字符串，测试用宽类型进、断言解析出的领域形状（SearchSchemaInput 是品牌类型，无法结构化构造） */
function parse(search: Record<string, unknown>): OrdersSearch {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SearchSchemaInput 是品牌类型，无法结构化构造，测试收口在这一处
    return parseOrdersSearch(search as OrdersSearchInput)
}

/**
 * 订单列表 URL 参数的解析契约：URL 是页签与页码的唯一真源，脏值必须收敛成合法初态
 * （与详情页 ?spec=、结算页 ?lines= 同一策略），而不是把用户挡在错误页外。
 */
describe("parseOrdersSearch", () => {
    it("无参数时收敛到默认初态：全部页签第 1 页", () => {
        expect(parse({})).toEqual({ tab: "all", page: 1 })
    })

    it("合法页签与字符串页码正常映射（URL 值永远是字符串）", () => {
        expect(parse({ tab: "pending_payment", page: "2" })).toEqual({
            tab: "pending_payment",
            page: 2,
        })
    })

    it("乱串页签不报错，退化成「全部」", () => {
        expect(parse({ tab: "anything" }).tab).toBe("all")
    })

    it("越界/非整数页码一律回第 1 页，交给数据到达后的钳制处理真实上界", () => {
        expect(parse({ page: "0" }).page).toBe(1)
        expect(parse({ page: "-3" }).page).toBe(1)
        expect(parse({ page: "abc" }).page).toBe(1)
        expect(parse({ page: "1.5" }).page).toBe(1)
    })

    it("页码在总页数内不触发修正，越界时退回最后一页", () => {
        expect(outOfRangePage(1, 2)).toBeUndefined()
        expect(outOfRangePage(3, 2)).toBe(2)
        expect(outOfRangePage(99, 0)).toBe(1)
    })
})
