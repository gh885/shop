#!/usr/bin/env node
// 数据库迁移 lint 门禁：只查「相对基线新增 / 改动的迁移」，不查历史已上生产的迁移。
//
// 为什么只查增量：迁移是不可变的（仓库铁律「脚本一旦合入不允许修改」），历史迁移早跑过生产，
// 即便 squawk 说它「非并发建索引」你也改不了——全量查只会让 CI 在 V9 这类老迁移上永远红，
// 等于没有门禁。真正要拦的是「新合进来的危险迁移」。
//
// 增量怎么定：
//   - CI 的 PR：用 GITHUB_BASE_REF（PR 的目标分支）。
//   - 本地 pre-push：用 origin/main（本机 ahead 的那部分）。
//   - 都没有（如孤立分支、未拉 origin）：跳过并提示，而不是退化成全量查。
//
// 实际检查交给 squawk（.squawk.toml 配置），本脚本只负责挑文件 + 调它。

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

const MIG_DIR = "apps/server/src/main/resources/db/migration"
const REPO_ROOT = resolve(import.meta.dirname, "..")

/** 跑 git，失败返回 null 而不是抛（用于探测 ref 是否存在）。 */
function gitSafe(args) {
    try {
        return execFileSync("git", args, {
            cwd: REPO_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim()
    } catch {
        return null
    }
}

/** 探测可用的基线 ref。 */
function resolveBase() {
    if (process.env.MIGRATIONS_BASE) return process.env.MIGRATIONS_BASE
    if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`
    if (gitSafe(["rev-parse", "--verify", "origin/main"]) !== null) return "origin/main"
    return null
}

const base = resolveBase()
if (!base) {
    console.log("[db-migrations] 无法确定基线（无 origin/main 且非 CI PR），跳过迁移 lint。")
    process.exit(0)
}

// ...HEAD（三粒点）相对 merge-base 取「本分支侧改动」，正好是 PR / 本地 ahead 的那批迁移。
const raw = gitSafe(["diff", "--name-only", "--diff-filter=AMR", `${base}...HEAD`])
if (raw === null) {
    console.log(`[db-migrations] 基线 ${base} 无法 diff（可能未 fetch），跳过迁移 lint。`)
    process.exit(0)
}

const changed = raw
    .split("\n")
    .filter(Boolean)
    .filter((f) => f.startsWith(MIG_DIR + "/") && f.endsWith(".sql"))

if (changed.length === 0) {
    console.log("[db-migrations] 相对基线无新增 / 改动的迁移文件，跳过。")
    process.exit(0)
}

console.log(`[db-migrations] 检查 ${changed.length} 个迁移文件（基线 ${base}）:`)
for (const f of changed) console.log("  " + f)

// squawk 按仓库根的 .squawk.toml 配置执行；未匹配模式不报错（这里传的是具体文件，不会触发）。
// 任一违规 → squawk 非零退出 → 本脚本透传退出码，门禁变红。
try {
    execFileSync("pnpm", ["exec", "squawk", "--reporter", "gcc", ...changed], {
        cwd: REPO_ROOT,
        stdio: "inherit",
    })
} catch (error) {
    const code = typeof error.status === "number" ? error.status : 1
    console.error(`\n[db-migrations] 发现危险迁移（squawk 退出 ${code}）。`)
    process.exit(code)
}
