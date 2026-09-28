import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { PhoneField } from "./phone-field"

/**
 * PhoneField —— 固定 +86、只收 11 位裸号。两个要钉住的：
 *  1) 形态与登录表单其余字段一致：filled 皮肤（InputGroup[data-slot=input-group]）+ 静态
 *     「+86」前缀，不是国旗/国家下拉；
 *  2) 实时有效性用号码元数据判断，且**只在填满 11 位后才判红**——半截号码不该一直报错。
 */
describe("PhoneField", () => {
    it("渲染 filled 皮肤的 InputGroup + 静态 +86 前缀（非国旗）", () => {
        const { container } = render(
            <PhoneField
                value=""
                onChange={() => {}}
            />,
        )

        const group = container.querySelector('[data-slot="input-group"]')
        expect(group).toBeInTheDocument()
        // filled 变体：不透明的 sunken 灰底 + 透明描边占位（聚焦才染色，见 input-group.tsx）
        expect(group?.className).toContain("bg-sunken")
        expect(screen.getByText("+86")).toBeInTheDocument()
        // 没有国旗 svg（reui PhoneInput 的形态不该混进来）
        expect(container.querySelector("svg")).toBeNull()
    })

    it("只保留数字，且不超过 11 位", async () => {
        const user = userEvent.setup()
        // 受控组件：用有状态的外壳真实驱动 value，否则每敲一位看到的都是空串
        function Controlled() {
            const [v, setV] = useState("")
            return (
                <PhoneField
                    value={v}
                    onChange={setV}
                />
            )
        }
        render(<Controlled />)
        const input = screen.getByLabelText("手机号")

        await user.type(input, "138a0013b80001234")
        // 非数字被剥掉，且受 maxLength 截断在 11 位
        expect(input).toHaveValue("13800138000")
        expect(input).toHaveAttribute("maxLength", "11")
    })

    it("未填满 11 位不判红；填满且号码元数据判非法才判红；合法不判红", () => {
        const { rerender } = render(
            <PhoneField
                value="138"
                onChange={() => {}}
            />,
        )
        // 半截：不标红
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "false")

        // 填满 11 位但号码元数据判非法（如全 0）
        // 注：号码库的 CN 校验比项目契约 ^1[3-9]\d{9}$ 宽（1x 开头基本都放行），
        // 所以真正的「1[3-9]」那条硬规则仍由表单 schema（PhoneSchema）把关，这里只管
        // 「位数/号段元数据」这一层实时反馈。
        rerender(
            <PhoneField
                value="00000000000"
                onChange={() => {}}
            />,
        )
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "true")

        // 合法大陆手机号
        rerender(
            <PhoneField
                value="13800138000"
                onChange={() => {}}
            />,
        )
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "false")
    })
})
