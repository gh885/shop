import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import { renderWithProviders } from "@shop/app-kit/test"
import { useAppForm } from "@shop/ui-web"

import { sellerMessages } from "#/locales"
import { EMPTY_PRODUCT_BASIC_FORM, type ProductBasicForm } from "#/product/draft-model"

import { BasicInfoSection } from "./BasicInfoSection"
import { markProductBasicFieldErrors, productBasicServerFieldMap } from "./BasicStep"

/**
 * 商品发布表单的服务端 422 落框（`CreateProductRequest` / `UpdateProductRequest` 那一族）。
 *
 * 钉两件事：
 * 1. **映射本身**：`mainImage` 落回「商品图片」那一格（表单里没有主图输入，`toBasicPayload` 发的就是
 *    `images[0]`）；带下标的元素级路径按当前值列全；`categoryId` / `params[i].*` 不在白名单里
 *    （前者是第一步定的、后者这条流程压根不发）。
 * 2. **真皮肤上落得下去**：那句话出现在标题输入框下面、出现在图片那一格的错误位上（那一格平时显示
 *    的是说明文案，出错时才换成错误行）——`applyServerFieldErrors` 的机制在 ui-web 侧已有测试，
 *    这里只管「这张表单的框接得住」。
 */

/** 后端 422 的一条明细（句子按 `rule` 从 catalog 出，UI 不再抄 `message` 那句中文） */
function validation422(
    errors: Array<{ field: string; message: string; rule?: string; min?: number; max?: number }>,
) {
    return { status: 422, detail: "参数校验失败", errors }
}

const rows = (overrides: Partial<ProductBasicForm> = {}): ProductBasicForm => ({
    ...EMPTY_PRODUCT_BASIC_FORM,
    ...overrides,
})

describe("productBasicServerFieldMap", () => {
    it("mainImage 落回「商品图片」那一格（表单里没有主图这个输入）", () => {
        expect(productBasicServerFieldMap(rows()).mainImage).toBe("images")
        expect(productBasicServerFieldMap(rows()).name).toBe("name")
        expect(productBasicServerFieldMap(rows()).subtitle).toBe("subtitle")
    })

    it("元素级路径按当前值列全下标，不多不少", () => {
        const map = productBasicServerFieldMap(
            rows({ images: ["a", "b", "c"], detailImages: ["d"] }),
        )

        expect(map["images[0]"]).toBe("images")
        expect(map["images[2]"]).toBe("images")
        expect(map["images[3]"]).toBeUndefined()
        expect(map["detailImages[0]"]).toBe("detailImages")
        expect(map["detailImages[1]"]).toBeUndefined()
    })

    /** 这两族的 422 今天不可能出现：类目不在第二步的表单里，`params` 这条流程不发 */
    it("没有框的路径不列进来（白名单不猜形状）", () => {
        const keys = Object.keys(productBasicServerFieldMap(rows({ images: ["a"] })))

        expect(keys.filter((k) => k.startsWith("categoryId"))).toHaveLength(0)
        expect(keys.filter((k) => k.startsWith("params"))).toHaveLength(0)
    })
})

describe("markProductBasicFieldErrors", () => {
    /** 真表单 + 真分区：只有「提交失败后把明细交给表单」这一步是替身（生产里由 useBasicForm 的 catch 调） */
    function Harness({ error }: { error: unknown }) {
        const form = useAppForm({
            defaultValues: rows({ name: "宠物智能喂食器", images: ["img-1"] }),
            onSubmit: async ({ value }) => void value,
        })
        return (
            <>
                <BasicInfoSection
                    form={form}
                    uploadImage={async () => "https://cdn.example/x.png"}
                />
                <button
                    type="button"
                    onClick={() => markProductBasicFieldErrors(form, error)}
                >
                    落框
                </button>
            </>
        )
    }

    it("标题过长那句话出现在标题输入框下面", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <Harness
                error={validation422([
                    { field: "name", message: "商品标题最长 30 个字", rule: "MAX_LENGTH", max: 30 },
                ])}
            />,
            { resources: sellerMessages },
        )

        await user.click(screen.getByRole("button", { name: "落框" }))

        expect(await screen.findByText("最长 30 个字")).toBeInTheDocument()
        expect(screen.getByRole("textbox", { name: /商品标题/ })).toHaveAttribute(
            "aria-invalid",
            "true",
        )
    })

    it("后端说 mainImage 有问题 → 红在「商品图片」那一格（说明文案换成错误行）", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <Harness
                error={validation422([
                    {
                        field: "mainImage",
                        message: "图片地址过长",
                        rule: "MAX_LENGTH",
                        max: 512,
                    },
                ])}
            />,
            { resources: sellerMessages },
        )

        await user.click(screen.getByRole("button", { name: "落框" }))

        expect(await screen.findByText("最长 512 个字")).toBeInTheDocument()
        expect(screen.queryByText(/第一张即主图/)).not.toBeInTheDocument()
    })

    /** 一个字段多条明细（长度 + 格式）时只占一行：一个框显示不完两句话 */
    it("同一格两条明细只留第一条", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <Harness
                error={validation422([
                    { field: "name", message: "商品标题最长 30 个字", rule: "MAX_LENGTH", max: 30 },
                    { field: "name", message: "商品标题不能包含联系方式", rule: "PATTERN" },
                ])}
            />,
            { resources: sellerMessages },
        )

        await user.click(screen.getByRole("button", { name: "落框" }))

        expect(await screen.findByText("最长 30 个字")).toBeInTheDocument()
        expect(screen.queryByText("格式不对")).not.toBeInTheDocument()
    })

    it("白名单外的路径不落红（categoryId 是第一步的事）", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <Harness error={validation422([{ field: "categoryId", message: "类目不能为空" }])} />,
            { resources: sellerMessages },
        )

        await user.click(screen.getByRole("button", { name: "落框" }))

        expect(screen.queryByText("类目不能为空")).not.toBeInTheDocument()
    })

    it("非 422 的错误不写任何一格（登录那种 401 走横幅/toast，不是字段级）", async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness error={{ status: 403, detail: "无权访问该店铺" }} />, {
            resources: sellerMessages,
        })

        await user.click(screen.getByRole("button", { name: "落框" }))

        // 不调用 applyServerFieldErrors 就清不掉上一轮：这条断言钉的是「空明细也要落一次」
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
})
