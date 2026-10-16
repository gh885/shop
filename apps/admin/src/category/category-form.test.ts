import { describe, expect, it } from "vite-plus/test"

import { categoryFormSchema } from "./category-form"

describe("categoryFormSchema", () => {
    it("纯空白的名称被拦（超长不归这里管，它由契约镜像与门禁钉）", () => {
        expect(categoryFormSchema.safeParse({ name: "   ", iconUrl: "" }).success).toBe(false)
        expect(categoryFormSchema.safeParse({ name: "服装", iconUrl: "" }).success).toBe(true)
    })

    it("iconUrl 那一格的 optional 被 unwrap 掉了：字段必须在场，值可以是空串（= 不配图标）", () => {
        expect(categoryFormSchema.safeParse({ name: "服装" }).success).toBe(false)
        expect(categoryFormSchema.safeParse({ name: "服装", iconUrl: "/i/a.png" }).success).toBe(
            true,
        )
    })
})
