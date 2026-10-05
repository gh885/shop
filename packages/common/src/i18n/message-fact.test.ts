import { describe, expect, it } from "vite-plus/test"

import { messageFactFactory, type CheckedMessageFact, type MessageFact } from "./message-fact"

/**
 * 事实工厂的绑定（docs/conventions/i18n.md §6.1）。
 *
 * 这一层的价值全在**编译期**，所以下面那组 `typeonly` 里的调用都带 `@ts-expect-error`：
 * `pnpm typecheck` 会核「那个错真的存在」（把 @ts-expect-error 删掉就红），而 vitest 跑它们只是为了
 * 让文件不空。它们不改变运行时行为——运行时只有 `describe` 里那两条断言。
 */

const KEYS = ["a.plain", "a.bounded"] as const
type Params = { [K in (typeof KEYS)[1]]: { max: number } }
const fact = messageFactFactory<(typeof KEYS)[number], Params>()

/** 只在编译期有意义：这几句就是要红的，且不许执行 */
function typeonly(raw: MessageFact): void {
    // @ts-expect-error 无类型事实不能绕过构造处校验
    const unchecked: CheckedMessageFact = raw
    // @ts-expect-error 手写对象不能冒充已检查的消息
    const forged: CheckedMessageFact = { message: "a.bounded", params: { max: 30 } }
    void unchecked
    void forged
    // 无参 key：不带参数
    fact("a.plain")
    // @ts-expect-error 无参 key 多传参数（t 的可选位拦得住，这里也拦得住）
    fact("a.plain", { max: 1 })
    // 带参 key：参数必须给
    fact("a.bounded", { max: 30 })
    // @ts-expect-error 带参 key 漏传参数 → 运行时只能降级为 key
    fact("a.bounded")
    // @ts-expect-error 参数名写错（这条正是此前手写 `params: Record<string, string | number>` 拦不住的）
    fact("a.bounded", { maximum: 30 })
    // @ts-expect-error 参数值类型不符（槽位是数字）
    fact("a.bounded", { max: "30" })
    // @ts-expect-error key 不在本 catalog 里
    fact("a.unknown")
}

describe("messageFactFactory", () => {
    it("无参 key 只产 message，params 位不出现", () => {
        expect(fact("a.plain")).toEqual({ message: "a.plain" })
        expect("params" in fact("a.plain")).toBe(false)
    })

    it("带参 key 把参数原样带出去（key 与槽位都留在事实里，句子不在这一层）", () => {
        const checked: CheckedMessageFact = fact("a.bounded", { max: 30 })
        const fieldError: MessageFact = checked
        expect(fieldError).toEqual({
            message: "a.bounded",
            params: { max: 30 },
        })
    })

    // 不执行 typeonly，但引用一次让 oxlint 认它是用了的
    it("上面那组绑定由 tsc 核（见文件头）", () => {
        expect(typeof typeonly).toBe("function")
    })
})
