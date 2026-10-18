import { describe, expect, it } from "vite-plus/test"

import { partitionFindings } from "./db-migrations-lint.mjs"

/**
 * 只测判定，不测 spawn：这条门禁最容易出错的地方是「什么情况算放行」——
 * 放行条件写宽了等于没有门禁（危险迁移静默进主干），写窄了会把已合入的迁移天天报红。
 *
 * 反面清单来自 2026-10 的真实事故：基线选错（push 到 main 时 origin/main 等于 HEAD），
 * 一整份带删表删列的迁移从门禁底下走了过去。所以「解析不出来的一行要不要拦」也在这里钉住。
 */
describe("迁移 lint 的判定", () => {
    const FINDING =
        "apps/server/src/main/resources/db/migration/V85__refund.sql:21:0: warning: ban-drop-table Dropping a table may break existing clients."

    it("没进白名单的规则 → 拦", () => {
        const { blocked, allowed } = partitionFindings(FINDING, {})

        expect(allowed).toEqual([])
        expect(blocked).toHaveLength(1)
        expect(blocked[0]?.rule).toBe("ban-drop-table")
    })

    it("进了白名单 → 放行，并带上理由（理由要能进日志给人看）", () => {
        const { blocked, allowed } = partitionFindings(FINDING, {
            "V85__refund.sql": { "ban-drop-table": "一次性模型切换" },
        })

        expect(blocked).toEqual([])
        expect(allowed).toHaveLength(1)
        expect(allowed[0]?.reason).toBe("一次性模型切换")
    })

    it("同一份迁移里只放行列出来的那条规则，其余照拦", () => {
        const both = [
            FINDING,
            "apps/server/src/main/resources/db/migration/V85__refund.sql:42:0: warning: require-concurrent-index-creation During normal index creation, table updates are blocked.",
        ].join("\n")

        const { blocked, allowed } = partitionFindings(both, {
            "V85__refund.sql": { "ban-drop-table": "一次性模型切换" },
        })

        expect(allowed.map((item) => item.rule)).toEqual(["ban-drop-table"])
        expect(blocked.map((item) => item.rule)).toEqual(["require-concurrent-index-creation"])
    })

    it("白名单按文件名匹配：Windows 的反斜杠路径也认", () => {
        const windowsPath = FINDING.replaceAll("/", "\\")

        const { allowed } = partitionFindings(windowsPath, {
            "V85__refund.sql": { "ban-drop-table": "一次性模型切换" },
        })

        expect(allowed[0]?.file).toBe("V85__refund.sql")
    })

    it("理由为空的条目不算放行（空字符串是最容易写出来的假白名单）", () => {
        const { blocked } = partitionFindings(FINDING, {
            "V85__refund.sql": { "ban-drop-table": "" },
        })

        expect(blocked).toHaveLength(1)
    })

    it("解析不出来的行一律当问题放行不了（不静默吞掉）", () => {
        const { blocked } = partitionFindings("squawk: command not found", {})

        expect(blocked).toHaveLength(1)
        expect(blocked[0]?.rule).toBeNull()
    })

    it("空输出等于没有问题（squawk 全绿时就是空串）", () => {
        expect(partitionFindings("", {}).blocked).toEqual([])
    })
})
