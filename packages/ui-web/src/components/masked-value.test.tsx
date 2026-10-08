import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vite-plus/test"

import { MaskedValueCell } from "./masked-value"
import { UiLabelsProvider, type UiLabels } from "./ui-labels"

/**
 * 脱敏字段格：入口只在「看到的还是掩码」时存在，索取中必须禁掉。
 * 禁用不是为了防抖，是因为每一次索取都会在后端留下一条取用记录（ACC-79 / ORD-62）。
 *
 * 组件不再内置任何句子——按钮文案与那句带参数的可访问名由 provider 按当前语言传进来。
 * 这里包一层 `UiLabelsProvider` 打上与 app-kit 里 t("ui.maskedValue.*") 同形的一份，
 * 断言的是「provider 给的文案生效」这件事。
 */

const MASKED = "138****1234"
const PLAIN = "13800001234"

const LABELS: UiLabels = {
    confirm: { cancel: "取消", confirm: "确定" },
    searchBar: { button: "搜索", placeholder: "搜索商品", ariaLabel: "搜索商品" },
    stateError: { title: "出错了", retry: "重试", retrying: "重试中…" },
    imageUpload: {
        remove: "删除",
        drag: "拖拽排序",
        emptyAlt: "",
        gridLabel: "上传图片",
        readError: "读取图片失败",
        uploadError: "上传图片失败",
    },
    regionPicker: { placeholder: "选择省/市/区", searchPlaceholder: "搜索" },
    phoneField: { ariaLabel: "手机号", placeholder: "11 位手机号" },
    select: { placeholder: "请选择" },
    dateTimePicker: { placeholder: "选择日期", clear: "清除", done: "完成", timeAria: (l) => l },
    maskedValue: {
        view: "查看",
        ariaFor: (subject, value) =>
            subject ? `查看${subject}的号码 ${value}` : `查看号码 ${value}`,
    },
}

function renderCell(props: Partial<Parameters<typeof MaskedValueCell>[0]> = {}) {
    const onReveal = vi.fn<() => void>()
    const result = render(
        <UiLabelsProvider value={LABELS}>
            <MaskedValueCell
                value={MASKED}
                onReveal={onReveal}
                {...props}
            />
        </UiLabelsProvider>,
    )
    return { onReveal, rerender: result.rerender }
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
            <UiLabelsProvider value={LABELS}>
                <MaskedValueCell
                    value="138****1234"
                    onReveal={vi.fn<() => void>()}
                />
                <MaskedValueCell
                    value="139****5678"
                    onReveal={vi.fn<() => void>()}
                />
            </UiLabelsProvider>,
        )

        expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
            "查看号码 138****1234",
            "查看号码 139****5678",
        ])
    })

    it("切语言：按钮文案与可访问名随 provider 的 value 当场变（改版前靠模块单例，会滞后一帧或不更新）", () => {
        const { rerender } = renderCell()

        const enLabels: UiLabels = {
            ...LABELS,
            maskedValue: {
                view: "View",
                ariaFor: (_subject, value) => `View number ${value}`,
            },
        }
        rerender(
            <UiLabelsProvider value={enLabels}>
                <MaskedValueCell
                    value={MASKED}
                    onReveal={vi.fn<() => void>()}
                />
            </UiLabelsProvider>,
        )

        expect(screen.getByRole("button", { name: "View number 138****1234" })).toBeInTheDocument()
    })
})
