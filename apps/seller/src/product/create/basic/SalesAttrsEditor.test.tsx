import { useState } from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vite-plus/test"

import { SPEC_VALUE_MAX, SPEC_VALUES_MAX } from "@shop/common/domain"
import { makeCategoryAttrNode } from "@shop/test-utils"
import { renderWithProviders } from "@shop/app-kit/test"

import { sellerMessages } from "#/locales"
import type { SpecSelection } from "#/product/draft-rules"
import type { CategoryAttrNodeResponse } from "@shop/api/sdk"

import { SalesAttrsEditor } from "./SalesAttrsEditor"

const ATTR_ID = "6f1a5b1e-2f3c-4a5d-8e9f-0000000000b1"
const valueIdOf = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`

function makeNode(allowImage = false): CategoryAttrNodeResponse {
    return makeCategoryAttrNode(
        { id: ATTR_ID, required: false, allowImage },
        Array.from({ length: SPEC_VALUES_MAX }, (_, i) => ({ id: valueIdOf(i), value: `色${i}` })),
    )
}

// 必须像真实父级那样原样回灌上抛的 value：不回灌会被当外部灌值、草稿被重建（夹具的隐性前提）
function renderEditor(
    value: SpecSelection[],
    node = makeNode(),
    uploadImage = async (file: File) => file.name,
) {
    const onChange = vi.fn<(selections: SpecSelection[]) => void>()
    function Parent() {
        const [current, setCurrent] = useState(value)
        return (
            <SalesAttrsEditor
                attrs={[node]}
                value={current}
                onChange={(next) => {
                    onChange(next)
                    setCurrent(next)
                }}
                uploadImage={uploadImage}
            />
        )
    }
    renderWithProviders(<Parent />, { resources: sellerMessages })
    return onChange
}

const valueInputs = () => screen.getAllByPlaceholderText<HTMLInputElement>("输入或选择取值")

function valueInput(i: number): HTMLInputElement {
    const input = valueInputs()[i]
    if (!input) throw new Error(`期望第 ${i} 行取值输入存在`)
    return input
}

function filled(count: number): SpecSelection {
    return {
        attrId: ATTR_ID,
        valueIds: makeNode()
            .values.slice(0, count)
            .map((v) => v.id),
        customValues: [],
    }
}

describe("SalesAttrsEditor 取值上限", () => {
    it("取值输入卡到契约那一格的字数", () => {
        renderEditor([])

        expect(screen.getByPlaceholderText("输入或选择取值")).toHaveAttribute(
            "maxlength",
            String(SPEC_VALUE_MAX),
        )
    })

    it("没到档时「添加取值」可点，计数只是行数", () => {
        renderEditor([filled(3)])

        expect(screen.getByRole("button", { name: "添加取值" })).toBeEnabled()
        expect(screen.getByText("(3)")).toBeInTheDocument()
    })

    it("到档就停手：加不动了，并把上限写在计数上", () => {
        renderEditor([filled(SPEC_VALUES_MAX)])

        expect(screen.getByRole("button", { name: "添加取值" })).toBeDisabled()
        expect(screen.getByText(`${SPEC_VALUES_MAX}/${SPEC_VALUES_MAX}`)).toBeInTheDocument()
    })
})

// 命中模板值记 valueId、值域外算自定义：这条 valueId 分界回显与上抛两头都得守，SKU 组合与建档都靠它
describe("SalesAttrsEditor 回显与上抛", () => {
    it("回显：模板值、自定义值各占一行；模板里已下架的取值留成空行", () => {
        renderEditor([
            { attrId: ATTR_ID, valueIds: [valueIdOf(0), "gone"], customValues: ["雾霾蓝"] },
        ])

        expect(valueInputs().map((i) => i.value)).toEqual(["色0", "", "雾霾蓝"])
    })

    it("命中模板值记 valueId，值域外文本 trim 后算自定义值，空行不上抛", async () => {
        const user = userEvent.setup()
        const onChange = renderEditor([])

        // 键入会弹出模板值下拉并把页面其余部分设为 aria-hidden，Esc 收起后才点得到「添加取值」
        await user.type(valueInput(0), "色1{Escape}")
        await user.click(screen.getByRole("button", { name: "添加取值" }))
        await user.type(valueInput(1), " 雾霾蓝 {Escape}")
        await user.click(screen.getByRole("button", { name: "添加取值" }))

        expect(onChange).toHaveBeenLastCalledWith([
            { attrId: ATTR_ID, valueIds: [valueIdOf(1)], customValues: ["雾霾蓝"] },
        ])
    })

    it("一个维度的取值全清空，整个维度就不再上抛", async () => {
        const user = userEvent.setup()
        const onChange = renderEditor([filled(1)])

        await user.clear(valueInput(0))

        expect(onChange).toHaveBeenLastCalledWith([])
    })

    it("取值图只随有值的行上抛：模板值按 valueId、自定义值按文本归档", async () => {
        const user = userEvent.setup()
        const onChange = renderEditor(
            [{ attrId: ATTR_ID, valueIds: [valueIdOf(0)], customValues: ["雾霾蓝"] }],
            makeNode(true),
        )
        await user.click(screen.getByRole("button", { name: "添加取值" }))

        // 传完一张该行就换成缩略图、file input 随之消失，所以每次取剩下的第一个，依次落到第 1/2/3 行
        for (const [n, name] of ["a.png", "b.png", "c.png"].entries()) {
            const input = document.querySelector('input[type="file"]')
            if (!input) throw new Error("期望还有未传图的行")
            fireEvent.change(input, {
                target: { files: [new File(["x"], name, { type: "image/png" })] },
            })
            // oxlint-disable-next-line eslint/no-await-in-loop -- 下一张要等上一行换成缩略图才轮得到，必须串行
            await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(n + 1))
        }

        expect(onChange).toHaveBeenLastCalledWith([
            {
                attrId: ATTR_ID,
                valueIds: [valueIdOf(0)],
                customValues: ["雾霾蓝"],
                valueImages: { [valueIdOf(0)]: "a.png" },
                customValueImages: { 雾霾蓝: "b.png" },
            },
        ])
    })

    it("并发上传互不覆盖：先发后至的那张不会把先落地的图冲掉", async () => {
        const pending = new Map<string, (url: string) => void>()
        const onChange = renderEditor(
            [filled(2)],
            makeNode(true),
            (file) => new Promise<string>((resolve) => pending.set(file.name, resolve)),
        )

        const inputs = document.querySelectorAll('input[type="file"]')
        for (const [i, input] of [...inputs].entries()) {
            fireEvent.change(input, {
                target: { files: [new File(["x"], `${i}.png`, { type: "image/png" })] },
            })
        }
        await waitFor(() => expect(pending.size).toBe(2))
        pending.get("1.png")?.("1.png")
        await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
        pending.get("0.png")?.("0.png")

        await waitFor(() =>
            expect(onChange).toHaveBeenLastCalledWith([
                {
                    ...filled(2),
                    valueImages: { [valueIdOf(0)]: "0.png", [valueIdOf(1)]: "1.png" },
                },
            ]),
        )
    })

    it("编辑回显带回取值图，且后续改动照样上抛", async () => {
        const user = userEvent.setup()
        const saved = { ...filled(1), valueImages: { [valueIdOf(0)]: "a.png" } }
        const onChange = renderEditor([saved], makeNode(true))

        expect(screen.getAllByRole("img")).toHaveLength(1)
        await user.click(screen.getByRole("button", { name: "添加取值" }))
        expect(onChange).toHaveBeenLastCalledWith([saved])
    })
})
