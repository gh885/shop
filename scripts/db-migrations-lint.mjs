#!/usr/bin/env node
// 数据库迁移 lint 门禁：只查「相对基线新增 / 改动的迁移」，不查历史已上生产的迁移。
//
// 为什么只查增量：迁移是不可变的（仓库铁律「脚本一旦合入不允许修改」），历史迁移早跑过生产，
// 即便 squawk 说它「非并发建索引」你也改不了——全量查只会让 CI 在 V9 这类老迁移上永远红，
// 等于没有门禁。真正要拦的是「新合进来的危险迁移」。
//
// 增量怎么定（由近到远，第一个拿得到的当基线）：
//   - MIGRATIONS_BASE：显式指定。CI 的 push 事件传 github.event.before（见 ci.yml）。
//   - GITHUB_BASE_REF：CI 的 PR，基线是目标分支。
//   - origin/main：本地 pre-push，基线是远端 main。
//   - 都没有：跳过并提示，而不是退化成全量查。
//
// **push 事件为什么必须传 github.event.before**：直接推 main 时，CI 检出后 origin/main 已经指向
// 刚推的那个提交，「origin/main...HEAD」是空 diff——门禁查了一圈，查的是「什么都没变」。
// 2026-10 实测就是这么放过了一笔带删表删列的迁移（V85）：本地因基线过旧报了红、CI 因基线太新报了绿。
// before 是「推之前 main 在哪」，那才是有变化可看的那一侧。
//
// 放行机制：squawk 没有「按文件忽略」的能力，所以「已合入、但确属一次性模型切换」的迁移写在
// scripts/db-migrations-allowlist.json，逐条带文件 + 规则 + 理由（纪律同 .gitleaks.toml）。
// 放行是**逐条**的：同一份迁移里没写进白名单的规则照样拦。

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { out as makeOut } from "./lib/out.mjs"

const o = makeOut("db-migrations")
const MIG_DIR = "apps/server/src/main/resources/db/migration"
const REPO_ROOT = resolve(import.meta.dirname, "..")
const ALLOWLIST_PATH = resolve(import.meta.dirname, "db-migrations-allowlist.json")

/** 新建分支/首次推送时 before 是全零 SHA，不能拿来 diff */
const ZERO_SHA = /^0+$/

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
    const explicit = process.env.MIGRATIONS_BASE?.trim()
    if (explicit && !ZERO_SHA.test(explicit)) return explicit
    if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`
    if (gitSafe(["rev-parse", "--verify", "origin/main"]) !== null) return "origin/main"
    return null
}

/**
 * 把 squawk 的 gcc 输出切成「要拦的」与「白名单放行的」。
 *
 * 单独抽成纯函数是为了能单测：这段最容易出错的不是解析，而是「什么情况算放行」——
 * 放行条件写宽了等于门禁失效，写窄了会天天假红。
 *
 * @param {string} output squawk 的 stdout
 * @param {Record<string, Record<string, string>>} allowlist 迁移文件名 → { 规则名: 理由 }
 */
export function partitionFindings(output, allowlist) {
    const blocked = []
    const allowed = []
    for (const line of output.split("\n")) {
        if (!line.trim()) continue
        // gcc reporter：`<file>:<line>:<col>: warning: <rule> <message>`
        const match = /^(.+?):(\d+):(\d+): (?:warning|error): ([\w-]+)/.exec(line)
        if (!match) {
            blocked.push({ line, rule: null })
            continue
        }
        const [, file, , , rule] = match
        const name = file.split(/[\\/]/).pop()
        const reason = allowlist[name]?.[rule]
        if (reason) allowed.push({ line, file: name, rule, reason })
        else blocked.push({ line, rule })
    }
    return { blocked, allowed }
}

function loadAllowlist() {
    try {
        const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
        // 下划线开头的键是给人看的说明，不参与匹配
        return Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith("_")))
    } catch {
        // 读不到就当作没有白名单：所有发现照拦（往严的方向失败，不往松的方向）
        return {}
    }
}

function main() {
    const base = resolveBase()
    if (!base) {
        o.info(
            "无法确定基线（无 MIGRATIONS_BASE / GITHUB_BASE_REF / origin/main），跳过迁移 lint。",
        )
        process.exit(0)
    }

    // 三粒点相对 merge-base 取「本分支侧改动」，正好是 PR / 本地 ahead 的那批迁移。
    const raw = gitSafe(["diff", "--name-only", "--diff-filter=AMR", `${base}...HEAD`])
    if (raw === null) {
        o.info(`基线 ${base} 无法 diff（可能未 fetch），跳过迁移 lint。`)
        process.exit(0)
    }

    const changed = raw
        .split("\n")
        .filter(Boolean)
        .filter((f) => f.startsWith(MIG_DIR + "/") && f.endsWith(".sql"))

    if (changed.length === 0) {
        o.info("相对基线无新增 / 改动的迁移文件，跳过。")
        process.exit(0)
    }

    o.info(`检查 ${changed.length} 个迁移文件（基线 ${base}）:`)
    for (const f of changed) o.raw("  " + f)

    let output = ""
    let status = 0
    try {
        output = execFileSync("pnpm", ["exec", "squawk", "--reporter", "gcc", ...changed], {
            cwd: REPO_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        })
    } catch (error) {
        status = typeof error.status === "number" ? error.status : 1
        output = error.stdout ?? ""
        // squawk 压根没跑起来（没装 / 崩溃）：没有 findings 可解析，直接透传，不假装通过
        if (!output.trim()) {
            o.err(`squawk 没能跑起来（退出 ${status}）。`)
            if (error.stderr) o.rawErr(String(error.stderr))
            process.exit(status)
        }
    }

    const { blocked, allowed } = partitionFindings(output, loadAllowlist())

    for (const item of allowed) {
        o.info(`白名单放行 ${item.file} · ${item.rule} —— ${item.reason}`)
    }

    if (blocked.length === 0) {
        o.info(`无需要拦的危险迁移（白名单放行 ${allowed.length} 条，逐条带理由）。`)
        process.exit(0)
    }

    for (const item of blocked) o.rawErr(item.line)
    o.err(`发现 ${blocked.length} 条危险迁移（squawk 退出 ${status || 1}）。`)
    process.exit(status || 1)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
