import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import { useAppForm } from "./form"
import { applyServerFieldErrors } from "./server-field-errors"

/**
 * `applyServerFieldErrors` —— 后端 422 的字段级提示交给表单。
 *
 * 钉的是**结果**不是机制：话出不出现在那个框上、改值后还在不在、改完还能不能再提交。
 *
 * 第一版是手写 `setFieldMeta` 写 `errorMap.onServer` + `errorSourceMap.onServer`，前两条都过、第三条过不了：
 * 在「表单级 validators.onSubmit + 字段自身没有 validator」（本仓库所有表单都是这个形状）那个组合下，
 * 改值**清不掉**那条服务端错误，`isValid` / `canSubmit` 一直是 false，**用户改对了也提交不了**
 * （实测 form-core 1.33.5：手写版改值后 `canSubmit=false`；交给 `setErrorMap` 后 `true|true` 且错误消失）。
 * 那版测试只钉了「显示 / 换字段 / 显式清空」，没钉「改值后能不能重提」，所以它绿着而功能是坏的。
 */
describe("applyServerFieldErrors", () => {
    /**
     * 表单级校验（与地址表单同形状：Zod 挂在 validators.onSubmit，字段自身没有 validator），
     * 服务端错误由 onSubmit 回调施加 —— 与真实调用点一致。
     */
    function SubmitHarness({ texts }: { texts: Record<string, string> }) {
        const form = useAppForm({
            defaultValues: { name: "" },
            validators: {
                onSubmit: ({ value }: { value: { name: string } }) => value.name.length > 0,
            },
            onSubmit: async () => {
                applyServerFieldErrors(form, texts)
            },
        })
        return (
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <form.Field name="name">
                    {(field) => (
                        <>
                            <input
                                aria-label="名称"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                            />
                            {/* 这就是 <FieldError> 内部读的那一格（见 form.tsx 的 FieldFrame） */}
                            <span data-testid="err">{field.state.meta.errors.join("|")}</span>
                        </>
                    )}
                </form.Field>
                <form.Subscribe selector={(s) => [s.canSubmit, s.isValid] as const}>
                    {([canSubmit, isValid]) => (
                        <span data-testid="state">{`${canSubmit}:${isValid}`}</span>
                    )}
                </form.Subscribe>
                <button type="submit">提交</button>
            </form>
        )
    }

    /** 直接施加（验替换语义：这一轮没提到的字段，那一条要跟着没） */
    function ApplyHarness({ texts }: { texts: Record<string, string> }) {
        const form = useAppForm({
            defaultValues: { name: "x", phone: "" },
            onSubmit: async () => {},
        })
        return (
            <div>
                <button
                    type="button"
                    onClick={() => applyServerFieldErrors(form, texts)}
                >
                    施加
                </button>
                <form.Field name="name">
                    {(field) => (
                        <span data-testid="err-name">{field.state.meta.errors.join("|")}</span>
                    )}
                </form.Field>
                <form.Field name="phone">
                    {(field) => (
                        <span data-testid="err-phone">{field.state.meta.errors.join("|")}</span>
                    )}
                </form.Field>
            </div>
        )
    }

    const err = () => screen.getByTestId("err").textContent
    const state = () => screen.getByTestId("state").textContent

    it("提交失败后那句话出现在对应字段的错误位上", async () => {
        const user = userEvent.setup()
        render(<SubmitHarness texts={{ name: "最长 30 个字" }} />)

        await user.click(screen.getByRole("button"))

        expect(err()).toBe("最长 30 个字")
    })

    /** 2026-10 修的那个 bug 的回归：清不掉 = 表单永久 isValid=false = 提交不了 */
    it("改值后服务端提示消失、表单恢复可提交（否则用户改对了也提交不了）", async () => {
        const user = userEvent.setup()
        render(<SubmitHarness texts={{ name: "最长 30 个字" }} />)
        await user.click(screen.getByRole("button"))
        expect(err()).toBe("最长 30 个字")

        await user.type(screen.getByLabelText("名称"), "商品")

        expect(err()).toBe("")
        expect(state()).toBe("true:true")
    })

    it("这一轮没提到的字段，上一轮那条要跟着清掉（不是逐字段 merge）", async () => {
        const user = userEvent.setup()
        const { rerender } = render(<ApplyHarness texts={{ name: "最长 30 个字" }} />)
        await user.click(screen.getByRole("button"))
        expect(screen.getByTestId("err-name").textContent).toBe("最长 30 个字")

        rerender(<ApplyHarness texts={{ phone: "格式不对" }} />)
        await user.click(screen.getByRole("button"))

        expect(screen.getByTestId("err-name").textContent).toBe("")
        expect(screen.getByTestId("err-phone").textContent).toBe("格式不对")
    })

    it("空对象 = 全部清掉（这一轮没有字段级明细）", async () => {
        const user = userEvent.setup()
        const { rerender } = render(<ApplyHarness texts={{ name: "最长 30 个字" }} />)
        await user.click(screen.getByRole("button"))

        rerender(<ApplyHarness texts={{}} />)
        await user.click(screen.getByRole("button"))

        expect(screen.getByTestId("err-name").textContent).toBe("")
    })
})
