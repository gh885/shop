import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vite-plus/test"

import { MaskedValueCell } from "./masked-value"

/**
 * 脱敏字段格：入口只在「看到的还是掩码」时存在，索取中必须禁掉。
 * 禁用不是为了防抖，是因为每一次索取都会在后端留下一条取用记录（ACC-79 / ORD-62）。
 */

const MASKED = "138****1234"
const PLAIN = "13800001234"

function renderCell(props: Partial<Parameters<typeof MaskedValueCell>[0]> = {}) {
    const onReveal = vi.fn<() => void>()
    render(
        <MaskedValueCell
            value={MASKED}
            onReveal={onReveal}
            {...props}
        />,
    )
    return { onReveal }
}

describe("MaskedValueCell", () => {
    it("掩码态：显示原样字符串并给一个索取入口", () => {
        renderCell()

        expect(screen.getByText(MASKED)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "查看号码 138****1234" })).toBeEnabled()
    })

    it("已是明文（写回这一行之后）：入口不再给", () => {
        renderCell({ value: PLAIN })

        expect(screen.getByText(PLAIN)).toBeInTheDocument()
        expect(screen.queryByRole("button")).toBeNull()
    })

    it("点一次：把动作交回调用点，组件自己不换值", async () => {
        const user = userEvent.setup()
        const { onReveal } = renderCell()

        await user.click(screen.getByRole("button", { name: "查看号码 138****1234" }))

        expect(onReveal).toHaveBeenCalledTimes(1)
    })

    it("索取中：按钮禁用并转圈，连点不再产生第二次取用", async () => {
        const user = userEvent.setup()
        const { onReveal } = renderCell({ revealing: true })
        // Spinner 自带 role=status / aria-label=Loading，会并进按钮可访问名，故用正则取
        const button = screen.getByRole("button", { name: /查看/ })

        expect(button).toBeDisabled()
        expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull()

        await user.click(button)
        await user.click(button)

        expect(onReveal).not.toHaveBeenCalled()
    })

    it("给出行主：可访问名带得上是谁的号码", () => {
        renderCell({ subject: "张三" })

        expect(
            screen.getByRole("button", { name: "查看张三的号码 138****1234" }),
        ).toBeInTheDocument()
    })

    it("没给行主（成员列表那种只有号码的行）：可访问名仍按号码分得开，不是一屏十个「查看」", () => {
        render(
            <>
                <MaskedValueCell
                    value="138****1234"
                    onReveal={vi.fn<() => void>()}
                />
                <MaskedValueCell
                    value="139****5678"
                    onReveal={vi.fn<() => void>()}
                />
            </>,
        )

        expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
            "查看号码 138****1234",
            "查看号码 139****5678",
        ])
    })
})
