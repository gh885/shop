import { describe, expect, it } from "vite-plus/test"

import { categoryFormSchema } from "./category-form"

describe("categoryFormSchema", () => {
    it("纯空白的名称与编码被拦（超长不归这里管，它由契约镜像与门禁钉）", () => {
        expect(categoryFormSchema.safeParse({ code: "c1", name: "   " }).success).toBe(false)
        expect(categoryFormSchema.safeParse({ code: "  ", name: "服装" }).success).toBe(false)
        expect(categoryFormSchema.safeParse({ code: "clothes", name: "服装" }).success).toBe(true)
    })

    it("两格都必须在场：code 是新契约的必填，缺了就是后端 422", () => {
        expect(categoryFormSchema.safeParse({ name: "服装" }).success).toBe(false)
        expect(categoryFormSchema.safeParse({ code: "clothes" }).success).toBe(false)
    })
})
