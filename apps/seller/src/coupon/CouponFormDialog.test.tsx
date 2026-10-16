import type { ReactElement } from "react"

import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { money } from "@shop/common/domain"
import { makeCouponTemplate, server } from "@shop/test-utils"

import { renderWithProviders as renderWithBase } from "@shop/app-kit/test"

import { sellerMessages } from "#/locales"

import { CouponFormDialog } from "./CouponFormDialog"

// 断言线上请求体而非组件内部 state：投影写错就是「100 元券变 1 元券」
const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"

async function fillDateTime(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    day: number,
    time: string,
) {
    const target = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        day,
        ...splitTime(time),
    )
    await user.click(screen.getByLabelText(label))
    const timeInput = await screen.findByLabelText(`${label}的时分`)
    const popover = timeInput.closest("[data-slot='popover-content']")
    if (!popover) throw new Error("没找到日期弹层")
    // 按 data-day 定位，不按按钮文本找：含补白日的月里同一个日子会出现两次
    const cell = popover.querySelector<HTMLButtonElement>(
        `[data-day="${target.toLocaleDateString("zh-Hans-CN")}"]`,
    )
    if (!cell) throw new Error(`日历里找不到 ${day} 号这一格`)
    await user.click(cell)
    // 只挑日不填时分，DateTimeField 会把时刻按 00:00 写回
    fireEvent.change(timeInput, { target: { value: time } })
    await user.click(screen.getByRole("button", { name: "完成" }))
    // 不等到值落到触发框就返回，提交时会读到空表单
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveTextContent(displayOf(target)))
    return target
}

function displayOf(moment: Date) {
    const ymd = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
    return `${ymd} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

function splitTime(time: string) {
    const [hour, minute] = time.split(":").map(Number)
    return [hour, minute, 0, 0] as const
}

const pad = (n: number) => String(n).padStart(2, "0")

// 今天恰好是 1 号时没有第二格可挑，所以终点至少 2 号
const START_DAY = 1
const START_TIME = "10:00"
const END_DAY = Math.max(2, new Date().getDate())

function renderWithProviders(ui: ReactElement) {
    return renderWithBase(ui, { resources: sellerMessages })
}

describe("CouponFormDialog", () => {
    // coverage 全量并发下这条会超 5s 默认线，只放宽这一条的超时
    it("提交：元换算成分、本地时间转成带时区 ISO 时刻，弹窗关闭", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        let body: unknown
        server.use(
            http.post("*/seller/coupons", async ({ request }) => {
                body = await request.json()
                return HttpResponse.json(makeCouponTemplate(), { status: 201 })
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "新春满减券")
        const threshold = screen.getByLabelText("使用门槛（元）")
        await user.clear(threshold)
        await user.type(threshold, "100")
        await user.type(screen.getByLabelText("面额（元）"), "10")
        const total = screen.getByLabelText("发放总量")
        await user.clear(total)
        await user.type(total, "50")
        const validFrom = await fillDateTime(user, "发放窗口起点", START_DAY, START_TIME)
        await fillDateTime(user, "发放窗口终点", END_DAY, START_TIME)

        await user.click(screen.getByRole("button", { name: "创建" }))

        // 全量并发跑时 1s 默认不够，宁给余量不把断言改松
        await waitFor(() => expect(body).toBeDefined(), { timeout: 5000 })
        expect(body).toMatchObject({
            name: "新春满减券",
            thresholdAmount: money(10000),
            discountAmount: money(1000),
            totalQuantity: 50,
        })
        // 本地 10:00 是同一个瞬间，但必须以带时区的 ISO 发给 OffsetDateTime
        const sentFrom =
            typeof body === "object" && body !== null && "validFrom" in body
                ? body.validFrom
                : undefined
        expect(Date.parse(String(sentFrom))).toBe(validFrom.getTime())
        expect(String(sentFrom)).toMatch(/Z$/)
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    }, 15000)

    it("门槛填 0：按无门槛原样提交 0，不是被当成缺填丢掉", async () => {
        const user = userEvent.setup()
        let body: unknown
        server.use(
            http.post("*/seller/coupons", async ({ request }) => {
                body = await request.json()
                return HttpResponse.json(
                    makeCouponTemplate({ threshold: { amount: 0, currency: "CNY" } }),
                    { status: 201 },
                )
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={() => undefined}
                shopId={SHOP_ID}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "无门槛券")
        await user.type(screen.getByLabelText("面额（元）"), "10")
        await fillDateTime(user, "发放窗口起点", START_DAY, START_TIME)
        await fillDateTime(user, "发放窗口终点", END_DAY, START_TIME)
        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(body).toBeDefined(), { timeout: 5000 })
        expect(body).toMatchObject({ thresholdAmount: money(0) })
    })

    it("面额大于门槛：拦在本地并说明原因，不发请求", async () => {
        const user = userEvent.setup()
        const posted = vi.fn<() => void>()
        server.use(
            http.post("*/seller/coupons", () => {
                posted()
                return HttpResponse.json(makeCouponTemplate(), { status: 201 })
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={() => undefined}
                shopId={SHOP_ID}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "填反了的券")
        const threshold = screen.getByLabelText("使用门槛（元）")
        await user.clear(threshold)
        await user.type(threshold, "10")
        await user.type(screen.getByLabelText("面额（元）"), "20")
        await fillDateTime(user, "发放窗口起点", START_DAY, START_TIME)
        await fillDateTime(user, "发放窗口终点", END_DAY, START_TIME)
        await user.click(screen.getByRole("button", { name: "创建" }))

        expect(await screen.findByText("面额不能超过使用门槛，请检查是否填反")).toBeInTheDocument()
        expect(posted).not.toHaveBeenCalled()
    })

    it("服务端 422 的字段级错误落到对应输入框上，弹窗留在原地", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        server.use(
            http.post("*/seller/coupons", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "name",
                                message: "券名最长 60 字",
                                rule: "MAX_LENGTH",
                                max: 60,
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={onOpenChange}
                shopId={SHOP_ID}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "新春满减券")
        const threshold = screen.getByLabelText("使用门槛（元）")
        await user.clear(threshold)
        await user.type(threshold, "100")
        await user.type(screen.getByLabelText("面额（元）"), "10")
        await fillDateTime(user, "发放窗口起点", START_DAY, START_TIME)
        await fillDateTime(user, "发放窗口终点", END_DAY, START_TIME)
        await user.click(screen.getByRole("button", { name: "创建" }))

        // 那句由前端 catalog 按 rule+max 出，不是后端 message 那句中文
        expect(await screen.findByText("最长 60 个字")).toBeInTheDocument()
        expect(screen.queryByText("券名最长 60 字")).not.toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
