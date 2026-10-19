import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@shop/app-kit/test"
import { useAppForm } from "@shop/ui-web"

import { sellerMessages } from "#/locales"
import { EMPTY_PRODUCT_BASIC_FORM } from "#/product/form"
import type { ForbiddenHit } from "#/product/forbidden-word"

import { BasicInfoSection } from "./BasicInfoSection"
import { useForbiddenWordMark } from "./forbidden-word-mark"

// 钉「注入+退场」：命中是服务端裁决只能外部写进 errorMap；撤下须库自己清——改完还红比不标更糟

const scrollIntoView = vi.fn<() => void>()

beforeAll(() => {
    // jsdom 缺这两个全局：effect 里要读「减少动效」偏好并把视口滚到「基础信息」区块
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }))
    Object.defineProperty(Element.prototype, "scrollIntoView", {
        value: scrollIntoView,
        writable: true,
        configurable: true,
    })
})

afterAll(() => {
    vi.unstubAllGlobals()
})

beforeEach(() => {
    scrollIntoView.mockClear()
})

const NAME_HIT: ForbiddenHit = { field: "name", message: "商品标题包含违禁词「最佳」，请修改" }
const SUBTITLE_HIT: ForbiddenHit = {
    field: "subtitle",
    message: "商品卖点包含违禁词「第一」，请修改",
}

function Harness({ hit }: { hit?: ForbiddenHit }) {
    const form = useAppForm({
        defaultValues: EMPTY_PRODUCT_BASIC_FORM,
        onSubmit: ({ value }) => void value,
    })
    useForbiddenWordMark({ form, hit })
    return (
        <BasicInfoSection
            form={form}
            uploadImage={async () => "https://cdn.example/x.png"}
        />
    )
}

const nameInput = () => screen.getByRole("textbox", { name: /商品标题/ })
const subtitleInput = () => screen.getByRole("textbox", { name: /商品卖点/ })

describe("useForbiddenWordMark", () => {
    it("命中标题 → 标题输入框标红、行内给出命中词，并把视口带到基础信息区块", async () => {
        renderWithProviders(<Harness hit={NAME_HIT} />, { resources: sellerMessages })

        expect(await screen.findByText(NAME_HIT.message)).toBeInTheDocument()
        expect(nameInput()).toHaveAttribute("aria-invalid", "true")
        expect(scrollIntoView).toHaveBeenCalled()
    })

    it("命中卖点 → 只标卖点，标题不受影响", async () => {
        renderWithProviders(<Harness hit={SUBTITLE_HIT} />, { resources: sellerMessages })

        expect(await screen.findByText(SUBTITLE_HIT.message)).toBeInTheDocument()
        expect(subtitleInput()).toHaveAttribute("aria-invalid", "true")
        expect(nameInput()).toHaveAttribute("aria-invalid", "false")
    })

    it("没有命中 → 两个字段都正常", () => {
        renderWithProviders(<Harness />, { resources: sellerMessages })

        expect(nameInput()).toHaveAttribute("aria-invalid", "false")
        expect(subtitleInput()).toHaveAttribute("aria-invalid", "false")
        expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it("卖家改了这个字段 → 红标自行撤下（库的清 onSubmit 槽规则，不是额外记账）", async () => {
        renderWithProviders(<Harness hit={NAME_HIT} />, { resources: sellerMessages })
        await screen.findByText(NAME_HIT.message)

        await userEvent.type(nameInput(), "宠物智能喂食器")

        expect(screen.queryByText(NAME_HIT.message)).not.toBeInTheDocument()
        expect(nameInput()).toHaveAttribute("aria-invalid", "false")
        // 另一个字段没被改，不该被连带撤下
        expect(subtitleInput()).toHaveAttribute("aria-invalid", "false")
    })
})
