import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { makeMerchantAddress, server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { sellerMessages } from "#/locales"

import { AddressFormDialog } from "./AddressFormDialog"

/**
 * 商家地址表单弹窗（走真实 TanStack Form + React Query + MSW，只 mock 网络层）。
 *
 * 钉三件这里独有、web 那侧没钉的事：
 * ① 编辑一条三级名是旧写法的地址，只改联系人再保存——出去的身体里三级名按 regionCode 重查，
 *    表单里没有也不该有那三个字段（同一事实两个来源，早晚会分家）；
 * ② 手选换成另一条路径，提交的码和三级名一起跟着换（名字不留在表单里等人去改）；
 * ③ 地区没选就是发不出去（区划码必须 6 位，市级 4 位码不算选过）。
 */

type Body = unknown

const SHOP_ID = "00000000-0000-4000-8000-000000000001"
const ADDRESS_ID = "00000000-0000-4000-8000-000000000003"

describe("AddressFormDialog", () => {
    it("编辑模式：地区路径按 regionCode 反查回填，保存发出的三级名以区划库为准", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const bodies: Body[] = []
        server.use(
            http.put(`*/seller/addresses/${ADDRESS_ID}`, async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeMerchantAddress({ id: ADDRESS_ID }))
            }),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
                editing={makeMerchantAddress({
                    id: ADDRESS_ID,
                    shopId: SHOP_ID,
                    regionCode: "441900",
                    // 库里存的是老写法：直筒子市省了「市」那一级的后缀，表单不照抄
                    province: "广东",
                    city: "东莞",
                    district: "",
                })}
            />,
            { resources: sellerMessages },
        )

        // RegionPicker 的 trigger 显示反查出来的路径 summary
        await screen.findByText("广东省 / 东莞市 / 东莞市")

        await user.clear(screen.getByLabelText("联系人姓名"))
        await user.type(screen.getByLabelText("联系人姓名"), "王五")
        await user.click(screen.getByRole("button", { name: "保存" }))

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
        expect(bodies).toHaveLength(1)
        expect(bodies[0]).toMatchObject({
            contactName: "王五",
            regionCode: "441900",
            province: "广东省",
            city: "东莞市",
            district: "东莞市",
            detail: "松山湖大道 1 号",
        })
    })

    it("手选地区：三级一路点到区，选完收起浮层、trigger 显示路径，保存按新码发名", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const bodies: Body[] = []
        server.use(
            http.put(`*/seller/addresses/${ADDRESS_ID}`, async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeMerchantAddress({ id: ADDRESS_ID }))
            }),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
                editing={makeMerchantAddress({
                    id: ADDRESS_ID,
                    shopId: SHOP_ID,
                    regionCode: "441900",
                    province: "广东",
                    city: "东莞",
                    district: "",
                })}
            />,
            { resources: sellerMessages },
        )

        // 初值那三级是 441900 反查出来的（trigger 是 role=combobox，可访问名 = 字段名「所在地区」，
        // 选中值作为内容被读出）
        const trigger = await screen.findByRole("combobox", { name: "所在地区" })
        expect(trigger).toHaveTextContent("广东省 / 东莞市 / 东莞市")

        await user.click(trigger)
        // columns 开在首列（省），一路点进下一列：行是 role=option，分支行带「, N item, submenu」
        // 的可访问名后缀（读屏要念出还有下级），所以用前缀匹配
        await user.click(await screen.findByRole("option", { name: /^北京市/ }))
        await user.click(await screen.findByRole("option", { name: /^市辖区/ }))
        await user.click(await screen.findByRole("option", { name: "东城区" }))

        // 叶子点完即收面，trigger 换成新路径
        expect(screen.queryByText("西城区")).not.toBeInTheDocument()
        expect(await screen.findByRole("combobox", { name: "所在地区" })).toHaveTextContent(
            "北京市 / 市辖区 / 东城区",
        )

        await user.click(screen.getByRole("button", { name: "保存" }))

        await waitFor(() => expect(bodies).toHaveLength(1))
        expect(bodies[0]).toMatchObject({
            regionCode: "110101",
            province: "北京市",
            city: "市辖区",
            district: "东城区",
        })
    })

    it("新增模式没选地区：拦下来说话，不发请求也不关窗", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const bodies: Body[] = []
        server.use(
            http.post("*/seller/addresses", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeMerchantAddress({ id: ADDRESS_ID }))
            }),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
            />,
            // 「请选择所在地区」这句在本端 catalog（`seller.shop.err.regionRequired`）：
            // 装置默认只有 app-kit 那份资源，不传就回落成裸 key
            { resources: sellerMessages },
        )

        await user.type(screen.getByLabelText("联系人姓名"), "王五")
        await user.type(screen.getByLabelText("联系电话"), "13800000000")
        await user.type(screen.getByLabelText("详细地址"), "松山湖大道 1 号")
        await user.click(screen.getByRole("button", { name: "保存" }))

        expect(await screen.findByText("请选择所在地区")).toBeInTheDocument()
        expect(bodies).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    /**
     * 后端 422 的字段级明细落到对应输入框上（此前只有一句全局 toast）。
     * 用编辑模式：初值已过本地校验（regionCode 有效），点保存即把 PUT 发出去，走得到 422 那条路。
     * 断的是「用户看得见的那句」由 catalog 按 rule+max 出，不是后端 message 那句中文。
     */
    it("服务端 422 的字段级错误落到对应输入框上，弹窗留在原地", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        server.use(
            http.put(`*/seller/addresses/${ADDRESS_ID}`, () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "contactName",
                                message: "联系人最长 30 字",
                                rule: "MAX_LENGTH",
                                max: 30,
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
                editing={makeMerchantAddress({
                    id: ADDRESS_ID,
                    shopId: SHOP_ID,
                    regionCode: "441900",
                })}
            />,
            { resources: sellerMessages },
        )

        await user.click(await screen.findByRole("button", { name: "保存" }))

        expect(await screen.findByText("最长 30 个字")).toBeInTheDocument()
        expect(screen.queryByText("联系人最长 30 字")).not.toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
