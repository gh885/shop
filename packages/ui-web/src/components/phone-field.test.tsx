import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vite-plus/test"

import { PhoneField } from "./phone-field"
import { NEUTRAL_UI_LABELS, UiLabelsProvider, type UiLabels } from "./ui-labels"

/** PhoneField：+86 固定前缀、非数字剥掉、超 11 位截断；实时有效性用号码元数据判、只在填满 11 位后才判红（半截号码不该一直报错）。皮肤形态不在这里钉，见 DESIGN.md */

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
        expect(input).toHaveValue("13800138000")
        expect(input).toHaveAttribute("maxLength", "11")
    })

    it("未填满 11 位不判红；填满且号码元数据判非法才判红；合法不判红", () => {
        const { rerender } = renderPhoneField({ value: "138" })
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "false")

        // 元数据层判非法用全 0：号码库 CN 校验比项目契约 ^1[3-9]\d{9}$ 宽，「1[3-9]」硬规则归表单 schema 把关，这里只钉位数/号段元数据这层实时反馈
        rerender(
            <UiLabelsProvider value={LABELS}>
                <PhoneField
                    value="00000000000"
                    onChange={() => {}}
                />
            </UiLabelsProvider>,
        )
        expect(screen.getByLabelText("手机号")).toHaveAttribute("aria-invalid", "true")

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
