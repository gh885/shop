import { ProductQuerySchema } from "@shop/api/schemas"
import { describe, expect, it } from "vite-plus/test"

import { PRODUCT_SORT_VALUES } from "./constants"

describe("排序词表", () => {
    it("与契约那格 pattern 同源：后端加了排序方式而这里没跟，当场红", () => {
        // `ProductQuery.sort` 在契约里是 @Pattern("newest|price_asc|price_desc") 而不是 enum
        // ——前端拿不到结构化的词表，TS 也切不开一个字面量类型（见 constants.ts 顶上那段），
        // 所以「与契约相等」只能由这条断言钉住，而不是靠类型。
        expect(PRODUCT_SORT_VALUES.join("|")).toBe(ProductQuerySchema.properties.sort.pattern)
    })
})
