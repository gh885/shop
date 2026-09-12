import { describe, expect, it } from "vitest"

import { renderWithProviders } from "#/test/render"

import { GroupAmountSentence } from "./GroupAmountSentence"

/**
 * 店铺组金额句。
 *
 * 这句话以前内联在结算路由里，于是「− 优惠 -¥3.00」这种双负号没人拦得住——读起来是
 * 「减负三块」，和同一行的应付金额自相矛盾。测试钉两件事：减号只出现一次；算术读得通。
 */

const money = (fen: number) => ({ amount: fen, currency: "CNY" })

function textOf(node: HTMLElement | null) {
    return node ? node.textContent.replaceAll(/\s+/g, " ").trim() : undefined
}

describe("GroupAmountSentence", () => {
    it("用券时：减号只出一个，优惠额不带负号（否则读成「减负」）", () => {
        renderWithProviders(
            <GroupAmountSentence
                itemAmount={money(9700)}
                shippingFee={money(0)}
                discountAmount={money(300)}
            />,
        )

        expect(textOf(document.querySelector("span"))).toBe(
            "商品总价 ¥97.00 + 运费 ¥0.00 − 优惠 ¥3.00",
        )
        expect(document.body.textContent).not.toContain("-¥")
    })

    it("不用券时：不画「优惠 ¥0.00」这一截", () => {
        renderWithProviders(
            <GroupAmountSentence
                itemAmount={money(9700)}
                shippingFee={money(0)}
                discountAmount={money(0)}
            />,
        )

        expect(textOf(document.querySelector("span"))).toBe("商品总价 ¥97.00 + 运费 ¥0.00")
    })
})
