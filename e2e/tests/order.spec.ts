import { expect, test } from "@playwright/test"

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"

interface Sku {
    id: string
    stock: number
    attributes: Array<{ name: string; value: string }>
}

interface ProductDetail {
    product: { id: string }
    skus: Sku[]
}

test.describe("下单主路径", () => {
    test("登录买家从商品详情立即购买并提交订单", async ({ page, request }) => {
        const productListResponse = await request.get(`${API_URL}/api/products?page=1&size=48`)
        expect(productListResponse.ok()).toBeTruthy()
        const productList = (await productListResponse.json()) as {
            records: Array<{ id: string }>
        }
        expect(productList.records.length).toBeGreaterThan(0)

        const productId = productList.records[0]!.id
        const detailResponse = await request.get(`${API_URL}/api/products/${productId}`)
        expect(detailResponse.ok()).toBeTruthy()
        const detail = (await detailResponse.json()) as ProductDetail
        const sku = detail.skus.find((item) => item.stock > 0)
        expect(sku).toBeDefined()

        const spec = Object.fromEntries(sku!.attributes.map((item) => [item.name, item.value]))
        const search = new URLSearchParams({ spec: JSON.stringify(spec) }).toString()
        await page.goto(`/products/${productId}?${search}`)
        await page.getByRole("button", { name: "立即购买" }).click()

        await expect(page).toHaveURL(/\/checkout\?/)
        await expect(page.getByText("应付总额：")).toBeVisible()
        await page.getByRole("button", { name: "提交订单" }).click()

        await expect(page).toHaveURL(/\/pay\/[0-9a-f-]{36}/)
        await expect(page.getByRole("button", { name: "确认支付" })).toBeVisible()
        await page.getByRole("button", { name: "确认支付" }).click()
        await expect(
            page.getByRole("main").getByRole("heading", { name: "支付成功" }),
        ).toBeVisible()
        await expect(page.getByText("订单已支付，等待商家发货。")).toBeVisible()
    })
})
