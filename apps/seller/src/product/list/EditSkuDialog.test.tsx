import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import type { Money } from "@shop/common/domain"
import { applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import type { SkuTextRow } from "#/product/draft-model"

import { skuServerFieldMap } from "./EditSkuDialog"

/**
 * 「编辑SKU / 编辑库存」弹窗的后端 422 落框（数组路径那一族）。
 *
 * 这个难点有两半，各钉一条：
 * 1. **框架认不认数组路径**：`setErrorMap({onServer:{fields}})` 的 key 是「已注册字段名」的字符串比对，
 *    于是 `rows[1].priceText` 这种名字本来就是个普通注册名——认。这条是下面所有接线的前提，
 *    所以直接钉住，而不是等某个弹窗顺带绿一次。
 * 2. **下标对不对得上**：服务端报的是 `items[k]`，而 `items` 是 `rows` 投影来的——库存模式会丢掉
 *    未定价的行（见 `toSkuUpdateItemsFromText`），所以 `k ≠ 行号`。这里钉的是「第 2 项 = 第 3 行」
 *    而不是「第 2 项 = 第 2 行」：落错框比不落框糟得多（用户会去改一个没错的规格）。
 */

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
    /** 未定价的那一行（`price === null`）在库存模式不进请求体：下标必须跟着投影走 */
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

    /** 库存模式的价格、价格模式的库存都是原样回传的：没有输入框，就不列进白名单（落不了地的路径） */
    it("只列本模式有框的路径", () => {
        const map = skuServerFieldMap("stock", rows)
        expect(Object.keys(map).every((k) => k.endsWith(".stock"))).toBe(true)
        expect(skuServerFieldMap("price", [])).toEqual({})
    })
})

/**
 * 两行 × 错误位，形状与弹窗一致：字段名是 `rows[i].priceText` 这种数组路径。
 * 两个 harness 各自渲染字段行（`form.AppField` 的类型绑在具体实例上，抽共享组件要绕泛型，不如重复八行）
 */
const rowsDefault = () => ({ rows: [{ priceText: "1.00" }, { priceText: "2.00" }] })

/** 提交路径那一段：真实弹窗经 handleSubmit 施加（首轮表单有效，submit 会执行） */
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

/** 替换语义走直接施加（与 ui-web 扁平版同形）：不走第二次 submit——上一轮的错误让
 *  canSubmit=false，handleSubmit 会短路，onSubmit 根本不执行（那是框架的既定行为，
 * 「改值清错误、恢复可提交」的另一半已由 ui-web 的用例钉住） */
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
