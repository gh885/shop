import { describe, expect, it } from "vite-plus/test"

import { parseOrdersSearch, type OrdersSearch, type OrdersSearchInput } from "./search"

function parse(search: Partial<OrdersSearchInput>): OrdersSearch {
    return parseOrdersSearch({ ...search, __TSearchSchemaInput__: "TSearchSchemaInput" })
}

describe("parseOrdersSearch", () => {
    it("无参数时收敛到默认初态：全部页签、不带游标", () => {
        expect(parse({})).toEqual({ tab: "all", cursor: undefined })
    })

    it("合法页签与游标原样透传（URL 值永远是字符串）", () => {
        expect(parse({ tab: "pending_payment", cursor: "cur-2" })).toEqual({
            tab: "pending_payment",
            cursor: "cur-2",
        })
    })

    it("乱串页签不报错，退化成「全部」", () => {
        expect(parse({ tab: "anything" }).tab).toBe("all")
    })

    it("游标缺席就是 undefined，游标为空串保持可选字段语义", () => {
        expect(parse({}).cursor).toBeUndefined()
        expect(parse({ cursor: "" }).cursor).toBe("")
    })
})
