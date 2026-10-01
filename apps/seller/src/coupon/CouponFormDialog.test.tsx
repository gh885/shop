import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { money } from "@shop/common"
import { makeCouponTemplate, server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { CouponFormDialog } from "./CouponFormDialog"

/**
 * 新建券弹窗的接线测试：走真实 React Query + MSW，断言**线上请求体**。
 *
 * 拦在客户端与送到后端的必须一致：金额以分为单位、时间带时区。
 * 只断言组件内部 state 会漏掉投影这一层——而投影写错就是「100 元券变 1 元券」。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"

/**
 * 有效期字段是日历弹层（`DateTimeField`），不是原生 `datetime-local`：按真实交互走一遍
 * 「点开 → 挑日 → 填时分 → 完成」。
 *
 * 挑的日子限定在**当前月内**（`day` 是 1 号到今天之间的某一天）：弹层默认就停在今天所在的月，
 * 测试因此不必去数翻页箭头，而断言要的只是「本地时刻被当成带时区 ISO 发出去」，与是哪一天无关。
 */
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
    // 弹层内的时分输入是唯一的落点，容器从它身上往上取（不靠 role 猜浮层语义）
    const timeInput = await screen.findByLabelText(`${label}的时分`)
    const popover = timeInput.closest("[data-slot='popover-content']")
    if (!popover) throw new Error("没找到日期弹层")
    // 日历格上带 `data-day`（与 Calendar 内部同 locale 的 toLocaleDateString）；
    // 靠它定位而不是按数字找按钮：含前后补白日的月里，同一个日子可能出现两次
    const cell = popover.querySelector<HTMLButtonElement>(
        `[data-day="${target.toLocaleDateString("zh-CN")}"]`,
    )
    if (!cell) throw new Error(`日历里找不到 ${day} 号这一格`)
    await user.click(cell)
    // 时分单独填：只挑日不填时分的话，DateTimeField 会把时刻按 00:00 写回
    fireEvent.change(timeInput, { target: { value: time } })
    await user.click(screen.getByRole("button", { name: "完成" }))
    // 等值真的落到触发框上再返回：不然「点日格 → 改时分」与后续点击的先后是不确定的，
    // 全量并发跑时偶发地会把「值还没落到表单」误报成提交失败
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveTextContent(displayOf(target)))
    return target
}

/** 触发框上的展示文案（`DateTimeField` 用 `yyyy-MM-dd HH:mm`），不引 date-fns 只为个格式化 */
function displayOf(moment: Date) {
    const ymd = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
    return `${ymd} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

/** "10:30" → [10, 30, 0, 0]，直接铺给 Date 构造器 */
function splitTime(time: string) {
    const [hour, minute] = time.split(":").map(Number)
    return [hour, minute, 0, 0] as const
}

const pad = (n: number) => String(n).padStart(2, "0")

/** 起点与终点固定用当月的 1 号与今天：同月、一屏装得下，断言又与具体日期无关。
    今天刚好是 1 号时没有第二格可挑，退到 2 号 */
const START_DAY = 1
const START_TIME = "10:00"
const END_DAY = Math.max(2, new Date().getDate())

describe("CouponFormDialog", () => {
    // 单跑这条是 ~1s，但 `pnpm test:coverage`（7 个 project 并发 + V8 逐文件插桩）能把它拖过 5s 默认线，
    // 红成「测试挂了」而其实是被抢 CPU。只给这一条放宽，不动全局 testTimeout：别处真挂住仍要 5s 就报。
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

        // 提交到请求发出是一条真实链路（校验 → mutation → MSW handler）。全量并发跑时
        // waitFor 默认的 1s 偶尔不够，给足余量而不是把断言改松。
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

    /**
     * 后端 422 的字段级明细落到对应输入框上。此前这里 `catch {}` 静默吞掉一切，用户点「创建」后
     * 只可能看见一句全局 toast、不知道是哪个框的问题——现在按 rule+max 出本地化句子挂到券名框上。
     */
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
