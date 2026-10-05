import { describe, expect, it } from "vite-plus/test"
import { decide } from "./secret-scan.mjs"

/**
 * 只测判定，不测 spawn：这条脚本最容易出错的地方是「什么情况算失败」，
 * 而那恰好是唯一能在任何环境里单测的部分（本机连子进程都创建不了也能跑）。
 *
 * 反面清单来自它替换掉的那段 shell：原来只有「找不到 gitleaks」和「gitleaks 自己失败」
 * 两种情况，且前者在 Windows 上因为多行 `run` 被拆坏而永远误判。
 */
describe("secret-scan 的判定", () => {
    it("没装 gitleaks（ENOENT）→ 跳过，不拦提交", () => {
        expect(decide({ status: null, error: { code: "ENOENT" } })).toEqual({ action: "skip" })
    })

    it("扫完没发现 → 通过", () => {
        expect(decide({ status: 0 })).toEqual({ action: "pass" })
    })

    it("发现泄漏（退出码 1）→ 拦下提交", () => {
        expect(decide({ status: 1 })).toEqual({ action: "leaks" })
    })

    it("gitleaks 自己出错（非 0/1）→ 也算失败，不静默放行", () => {
        const outcome = decide({ status: 3 })
        expect(outcome.action).toBe("fail")
        expect(outcome.reason).toContain("3")
    })

    it("进程压根起不来（EBUSY / EACCES 这类）→ 失败，绝不当作「没装」", () => {
        for (const code of ["EBUSY", "EACCES", "EPERM"]) {
            const outcome = decide({ status: null, error: { code } })
            expect(outcome.action).toBe("fail")
            expect(outcome.reason).toContain(code)
        }
    })

    it("没有 error 也没有 status（不该发生）→ 失败，不倒向「通过」", () => {
        expect(decide({ status: null }).action).toBe("fail")
    })
})
