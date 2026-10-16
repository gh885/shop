import { ErrorCodes } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { parseForbiddenWordError } from "./forbidden-word"

function hitError(
    errors?: unknown,
    detail = "「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交",
) {
    return { status: 400, code: ErrorCodes.FORBIDDEN_WORD_HIT, detail, errors }
}

describe("parseForbiddenWordError", () => {
    it("命中标题 → 定位到 name 字段并带出命中词", () => {
        expect(
            parseForbiddenWordError(
                hitError([{ field: "name", message: "「标题」包含违禁词「最佳」", value: "最佳" }]),
            ),
        ).toEqual({ field: "name", word: "最佳" })
    })

    it("命中卖点 → 定位到 subtitle 字段", () => {
        expect(
            parseForbiddenWordError(
                hitError([
                    {
                        field: "subtitle",
                        message: "「卖点」包含违禁词「全网第一」",
                        value: "全网第一",
                    },
                ]),
            ),
        ).toEqual({ field: "subtitle", word: "全网第一" })
    })

    it("多条明细里取这张表单认识的那条", () => {
        expect(
            parseForbiddenWordError(
                hitError([
                    { field: "detailImages", message: "「详情」包含违禁词「最佳」", value: "最佳" },
                    { field: "subtitle", message: "「卖点」包含违禁词「第一」", value: "第一" },
                ]),
            ),
        ).toEqual({ field: "subtitle", word: "第一" })
    })

    it("没带 value → 字段认得出，词为空：调用方退回那句不带词的 catalog 文案", () => {
        expect(parseForbiddenWordError(hitError([{ field: "name", message: "含违禁词" }]))).toEqual(
            {
                field: "name",
                word: undefined,
            },
        )
    })

    it("报的字段不是这张表单的（评价、售后复用同一出口）→ null，不硬猜字段", () => {
        expect(
            parseForbiddenWordError(
                hitError([{ field: "content", message: "「评价内容」含违禁词", value: "最佳" }]),
            ),
        ).toBeNull()
    })

    it("后端没给字段级明细（老契约）→ null，只给全局提示", () => {
        expect(parseForbiddenWordError(hitError())).toBeNull()
        expect(parseForbiddenWordError(hitError([]))).toBeNull()
    })

    it("不是这个码 → undefined，交给调用方按普通错误处理", () => {
        expect(
            parseForbiddenWordError({
                status: 400,
                code: ErrorCodes.CATEGORY_NOT_LEAF,
                detail: "只能挂到末级类目",
            }),
        ).toBeUndefined()
        expect(parseForbiddenWordError(new Error("网络中断"))).toBeUndefined()
    })
})
