import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SPEC_VALUE_MAX, SPEC_VALUES_MAX } from "@shop/common"
import { renderWithProviders } from "@shop/app-kit/test"

import type { SpecSelection } from "#/product/draft-model"
import type { CategoryAttrNodeResponse } from "@shop/api/sdk"

import { SalesAttrsEditor } from "./SalesAttrsEditor"

/**
 * 规格取值的两条上限落在编辑器哪里。
 *
 * 后端那一档（`SpecSelectionRequest`）在提交时才说话，而「取值写多长」「一个维度几个取值」是卖家
 * 边填边定的事：不卡就变成填完点提交、拿一句跟输入框无关的 400。
 */

const ATTR_ID = "6f1a5b1e-2f3c-4a5d-8e9f-0000000000b1"

/** 模板值域铺到满档：回显第 i 个取值时 id 与文本都对得上，行数只由喂进去的 value 决定 */
function makeNode(): CategoryAttrNodeResponse {
    return {
        attr: {
            id: ATTR_ID,
            categoryId: "6f1a5b1e-2f3c-4a5d-8e9f-0000000000c1",
            name: "颜色",
            kind: "SPEC",
            required: false,
            allowCustom: true,
            allowImage: false,
            sort: 0,
            status: "ENABLED",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        },
        values: Array.from({ length: SPEC_VALUES_MAX }, (_, i) => ({
            id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
            attrId: ATTR_ID,
            value: `色${i}`,
            sort: i,
            source: "PLATFORM" as const,
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
        })),
    }
}

function renderEditor(value: SpecSelection[]) {
    renderWithProviders(
        <SalesAttrsEditor
            attrs={[makeNode()]}
            value={value}
            onChange={() => undefined}
            uploadImage={async () => "k"}
        />,
    )
}

/** 回显靠 value 喂：前 count 个模板取值各占一行（命中模板值所以带 valueId） */
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
