import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vite-plus/test"

import { PhoneField } from "./phone-field"
import { NEUTRAL_UI_LABELS, UiLabelsProvider, type UiLabels } from "./ui-labels"

/**
 * PhoneField —— 固定 +86、只收 11 位裸号。两个要钉住的：
 *  1) 前缀是静态「+86」（不是国旗/国家下拉），且非数字输入被剥掉、超 11 位截断；
 *  2) 实时有效性用号码元数据判断，且**只在填满 11 位后才判红**——半截号码不该一直报错。
 *
 * 皮肤形态（data-slot / bg-sunken / 「不许出现 SVG」）不在这里钉：那是设计系统的事，
 * 加个帮助图标就会红一片，却证明不了视觉对不对，见 ui-web/DESIGN.md 与视觉走查。
 */

// 可访问名与占位现由 provider 按当前语言传进来；测前包一层与 appKit.ui.phoneField.* 同形的一份。
const LABELS: UiLabels = {
    ...NEUTRAL_UI_LABELS,
    phoneField: { ariaLabel: "手机号", placeholder: "11 位手机号" },
}

function renderPhoneField(props: Partial<Parameters<typeof PhoneField>[0]> = {}) {
    return render(
        <UiLabelsProvider value={LABELS}>
            <PhoneField
                value=""
                onChange={() => {}}
                {...props}
            />
        </UiLabelsProvider>,
    )
}

describe("PhoneField", () => {
    it("只保留数字，且不超过 11 位；前缀是静态 +86", async () => {
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
        render(
            <UiLabelsProvider value={LABELS}>
                <Controlled />
            </UiLabelsProvider>,
        )
        const input = screen.getByLabelText("手机号")
        expect(screen.getByText("+86")).toBeInTheDocument()

        await user.type(input, "138a0013b80001234")
        // 非数字被剥掉，且受 maxLength 截断在 11 位
        expect(input).toHaveValue("13800138000")
        expect(input).toHaveAttribute("maxLength", "11")
    })

    it("未填满 11 位不判红；填满且号码元数据判非法才判红；合法不判红", () => {
        const { rerender } = renderPhoneField({ value: "138" })
        // 半截：不标红
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "false")

        // 填满 11 位但号码元数据判非法（如全 0）
        // 注：号码库的 CN 校验比项目契约 ^1[3-9]\d{9}$ 宽（1x 开头基本都放行），
        // 所以真正的「1[3-9]」那条硬规则仍由表单 schema（PhoneSchema）把关，这里只管
        // 「位数/号段元数据」这一层实时反馈。
        rerender(
            <UiLabelsProvider value={LABELS}>
                <PhoneField
                    value="00000000000"
                    onChange={() => {}}
                />
            </UiLabelsProvider>,
        )
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "true")

        // 合法大陆手机号
        rerender(
            <UiLabelsProvider value={LABELS}>
                <PhoneField
                    value="13800138000"
                    onChange={() => {}}
                />
            </UiLabelsProvider>,
        )
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "false")
    })
})
