import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import type { Money } from "@shop/common/domain"
import { applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import type { SkuTextRow } from "#/product/draft-rules"

import { skuServerFieldMap } from "./EditSkuDialog"

const CNY = (amount: number): Money => ({ amount, currency: "CNY" })

function row(overrides: Partial<SkuTextRow> & Pick<SkuTextRow, "skuId">): SkuTextRow {
    return {
        label: overrides.skuId,
        price: CNY(100),
        priceText: "1.00",
        stockText: "10",
        stock: 10,
        skuCodeText: "",
        ...overrides,
    }
}

describe("skuServerFieldMap（后端 items[i] → 弹窗 rows[j]）", () => {
    // sku-b 未定价(price=null)：库存模式不进请求体，断言的下标必须跟着投影走，别把它当普通行删了
    const rows = [
        row({ skuId: "sku-a" }),
        row({ skuId: "sku-b", price: null, priceText: "" }),
        row({ skuId: "sku-c" }),
    ]

    it("库存模式：投影丢掉未定价的行，服务端第 1 项是第 3 行而不是第 2 行", () => {
        expect(skuServerFieldMap("stock", rows)).toEqual({
            "items[0].stock": "rows[0].stockText",
            "items[1].stock": "rows[2].stockText",
        })
    })

    it("价格模式：一行一条不丢，下标就是行号；改的是价格与商家编码", () => {
        expect(skuServerFieldMap("price", rows)).toEqual({
            "items[0].price": "rows[0].priceText",
            "items[0].price.amount": "rows[0].priceText",
            "items[0].skuCode": "rows[0].skuCodeText",
            "items[1].price": "rows[1].priceText",
            "items[1].price.amount": "rows[1].priceText",
            "items[1].skuCode": "rows[1].skuCodeText",
            "items[2].price": "rows[2].priceText",
            "items[2].price.amount": "rows[2].priceText",
            "items[2].skuCode": "rows[2].skuCodeText",
        })
    })

    it("只列本模式有框的路径", () => {
        const map = skuServerFieldMap("stock", rows)
        expect(Object.keys(map).every((k) => k.endsWith(".stock"))).toBe(true)
        expect(skuServerFieldMap("price", [])).toEqual({})
    })
})

const rowsDefault = () => ({ rows: [{ priceText: "1.00" }, { priceText: "2.00" }] })

function SubmitHarness({ texts }: { texts: Record<string, string> }) {
    const form = useAppForm({
        defaultValues: rowsDefault(),
        onSubmit: async () => {
            applyServerFieldErrors(form, texts)
        },
    })
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
            }}
        >
            {form.state.values.rows.map((row, i) => (
                <form.AppField
                    key={row.priceText}
                    name={`rows[${i}].priceText`}
                >
                    {(field) => (
                        <span data-testid={`err-${i}`}>{field.state.meta.errors.join("|")}</span>
                    )}
                </form.AppField>
            ))}
            <button type="submit">提交</button>
        </form>
    )
}

// 替换语义走直接施加不走第二次 submit：上轮错误让 canSubmit=false，handleSubmit 会短路、onSubmit 根本不执行
function ApplyHarness({ texts }: { texts: Record<string, string> }) {
    const form = useAppForm({
        defaultValues: rowsDefault(),
        onSubmit: async () => {},
    })
    return (
        <div>
            <button
                type="button"
                onClick={() => applyServerFieldErrors(form, texts)}
            >
                施加
            </button>
            {form.state.values.rows.map((row, i) => (
                <form.AppField
                    key={row.priceText}
                    name={`rows[${i}].priceText`}
                >
                    {(field) => (
                        <span data-testid={`err-${i}`}>{field.state.meta.errors.join("|")}</span>
                    )}
                </form.AppField>
            ))}
        </div>
    )
}

describe("数组路径能不能落到框上", () => {
    it("setErrorMap 认 `rows[1].priceText` 这样的 key：只有那一行红（经真实 submit 路径）", async () => {
        render(<SubmitHarness texts={{ "rows[1].priceText": "最高 9999999 元" }} />)
        await userEvent.setup().click(screen.getByRole("button"))

        expect(screen.getByTestId("err-0").textContent).toBe("")
        expect(screen.getByTestId("err-1").textContent).toBe("最高 9999999 元")
    })

    it("没提到的那一行不受影响（替换语义按字段逐个生效，与扁平字段同一套 key 规则）", async () => {
        const { rerender } = render(<ApplyHarness texts={{ "rows[0].priceText": "必填" }} />)
        const user = userEvent.setup()
        await user.click(screen.getByRole("button"))
        expect(screen.getByTestId("err-0").textContent).toBe("必填")

        rerender(<ApplyHarness texts={{ "rows[1].priceText": "最高 9999999 元" }} />)
        await user.click(screen.getByRole("button"))

        expect(screen.getByTestId("err-0").textContent).toBe("")
        expect(screen.getByTestId("err-1").textContent).toBe("最高 9999999 元")
    })
})
