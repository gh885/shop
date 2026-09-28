import { ErrorCodes } from "@shop/common"
import { describe, expect, it } from "vite-plus/test"

import { parseForbiddenWordError } from "./forbidden-word"

/**
 * 违禁词错误解析（COM-01）的契约测试。
 *
 * 这里钉的是**前端与后端 detail 形状之间的耦合**：`ForbiddenWordService.assertClean` 改一次措辞，
 * 对应的用例就会红，而不是等到卖家看见「商品标题包含违禁词「标题」」这种话才发现。
 * 后端那句文案的形状是「「字段」包含违禁词「词」（分类：…），请修改后重新提交」。
 */

/** 后端抛出的错误经 SDK 归一后的形状（只给解析要读的那几个字段） */
function hitError(detail: string) {
    return { status: 400, code: ErrorCodes.FORBIDDEN_WORD_HIT, detail }
}

describe("parseForbiddenWordError", () => {
    it("命中标题 → 定位到 name 字段并给出命中词", () => {
        expect(
            parseForbiddenWordError(
                hitError("「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交"),
            ),
        ).toEqual({ field: "name", message: "商品标题包含违禁词「最佳」，请修改" })
    })

    it("命中卖点 → 定位到 subtitle 字段", () => {
        expect(
            parseForbiddenWordError(
                hitError("「卖点」包含违禁词「全网第一」（分类：广告法用语），请修改后重新提交"),
            ),
        ).toEqual({ field: "subtitle", message: "商品卖点包含违禁词「全网第一」，请修改" })
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

    it("字段标签认不出（例如将来评价内容也过闸）→ null，不猜字段", () => {
        expect(
            parseForbiddenWordError(
                hitError("「评价内容」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交"),
            ),
        ).toBeNull()
    })

    it("detail 里没有命中词 → 仍定位字段，提示语原样用后端那句", () => {
        expect(parseForbiddenWordError(hitError("「标题」含敏感内容，请修改后重新提交"))).toEqual({
            field: "name",
            message: "「标题」含敏感内容，请修改后重新提交",
        })
    })
})
