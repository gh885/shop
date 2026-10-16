import { describe, expect, it } from "vite-plus/test"

import { parseOrdersSearch, type OrdersSearch } from "./orders-search"

function parse(search: { tab?: string; page?: unknown }): OrdersSearch {
    return parseOrdersSearch({ ...search, __TSearchSchemaInput__: "TSearchSchemaInput" })
}

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
})
