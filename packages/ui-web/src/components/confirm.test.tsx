import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { confirm, ConfirmDialogHost, type ConfirmOptions } from "./confirm"

/**
 * 全局命令式确认：confirm() 起面、ConfirmDialogHost 出面，
 * 兑现值（true=确认 / false=取消或接管）与 action promise 的三种结局（成功关、失败留、无 action 即关）。
 */

/** 起一次确认并回收兑现值：点按钮触发（confirm 是事件回调，不能在渲染期直调） */
function setup(options: ConfirmOptions) {
    const settled: { current: boolean | undefined } = { current: undefined }
    async function trigger() {
        settled.current = await confirm(options)
    }
    render(
        <>
            <button
                type="button"
                onClick={() => {
                    void trigger()
                }}
            >
                触发
            </button>
            <ConfirmDialogHost />
        </>,
    )
    return { settled }
}

async function open(options: ConfirmOptions) {
    const user = userEvent.setup()
    const ctx = setup(options)
    await user.click(screen.getByRole("button", { name: "触发" }))
    await screen.findByText(options.title)
    return { user, ...ctx }
}

/** 「新的接管旧的」用例的探针：两张面各记自己的兑现值 */
const taken: { first: boolean | undefined; second: boolean | undefined } = {
    first: undefined,
    second: undefined,
}

async function triggerFirst() {
    taken.first = await confirm({ title: "第一张" })
}

async function triggerSecond() {
    taken.second = await confirm({ title: "第二张" })
}

function TakeoverProbe() {
    return (
        <>
            <button
                type="button"
                onClick={() => {
                    void triggerFirst()
                }}
            >
                第一
            </button>
            <button
                type="button"
                onClick={() => {
                    void triggerSecond()
                }}
            >
                第二
            </button>
            <ConfirmDialogHost />
        </>
    )
}

describe("confirm", () => {
    it("点确认（无 action）：关面并兑现 true", async () => {
        const { user, settled } = await open({ title: "清空草稿" })

        await user.click(screen.getByRole("button", { name: "确定" }))

        expect(settled.current).toBe(true)
        expect(screen.queryByText("清空草稿")).toBeNull()
    })

    it("点取消：关面并兑现 false", async () => {
        const { user, settled } = await open({ title: "清空草稿" })

        await user.click(screen.getByRole("button", { name: "取消" }))

        expect(settled.current).toBe(false)
        expect(screen.queryByText("清空草稿")).toBeNull()
    })

    it("自定义文案：cancelText / confirmText 直接作为按钮名", async () => {
        const { user } = await open({
            title: "下架商品",
            confirmText: "下架",
            cancelText: "再想想",
        })

        expect(await screen.findByRole("button", { name: "下架" })).toBeTruthy()
        await user.click(screen.getByRole("button", { name: "再想想" }))
    })

    it("action 进行中：按钮禁用并转 Spinner，resolve 后关面兑现 true", async () => {
        let release!: () => void
        const action = () =>
            new Promise<void>((resolve) => {
                release = resolve
            })
        const { user, settled } = await open({ title: "删除地址", action })

        await user.click(screen.getByRole("button", { name: /确定/ }))
        const confirmButton = screen.getByRole("button", { name: /确定/ })
        expect(confirmButton.hasAttribute("disabled")).toBe(true)
        expect(screen.getByRole("button", { name: "取消" }).hasAttribute("disabled")).toBe(true)
        expect(confirmButton.querySelector('[data-slot="spinner"]')).not.toBeNull()

        release()
        await waitFor(() => expect(settled.current).toBe(true))
        expect(screen.queryByText("删除地址")).toBeNull()
    })

    it("action 失败：面保持打开可重试，之后取消兑现 false", async () => {
        let attempt = 0
        const { user, settled } = await open({
            title: "停用词条",
            action: async () => {
                attempt += 1
                if (attempt === 1) throw new Error("网络错误")
            },
        })

        await user.click(screen.getByRole("button", { name: /确定/ }))

        expect(screen.getByText("停用词条")).toBeTruthy()
        expect(settled.current).toBeUndefined()
        expect(screen.getByRole("button", { name: /确定/ }).hasAttribute("disabled")).toBe(false)

        await user.click(screen.getByRole("button", { name: "取消" }))

        expect(settled.current).toBe(false)
    })

    it("新的确认接管：旧的按取消兑现 false", async () => {
        const user = userEvent.setup()
        taken.first = undefined
        taken.second = undefined
        render(<TakeoverProbe />)

        await user.click(screen.getByRole("button", { name: "第一" }))
        await screen.findByText("第一张")
        // 弹窗打开后页面其余部分被 BaseUI 置为 inert（role 查询跳过），第二个触发点按文本取
        await user.click(screen.getByText("第二"))

        await screen.findByText("第二张")
        expect(taken.first).toBe(false)
        expect(screen.queryByText("第一张")).toBeNull()

        await user.click(screen.getByRole("button", { name: "确定" }))
        expect(taken.second).toBe(true)
    })
})
