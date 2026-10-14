#!/usr/bin/env node
/**
 * pre-commit 的密钥扫描：找 gitleaks → 只扫暂存内容 → 把结果原样变成退出码。
 *
 * 为什么是一段 Node 而不是直接写在 lefthook.yml 的 `run:` 里：原来的写法是
 *
 *     run: |
 *         if ! command -v gitleaks >/dev/null 2>&1; then echo …; exit 0; fi
 *         gitleaks git --pre-commit --staged --redact --no-banner
 *
 * 多行 `run` 在 Windows 上被 lefthook 交给 `sh -c` 时脚本被拆坏，实测报
 * `-c: line 3: syntax error: unexpected end of file from 'if' command on line 1`——
 * 于是这条钩子在 Windows 上**必然失败**：不是拦住了密钥，是根本没开始扫就拦住了提交。
 * 判定 + 调用挪进 Node，就没有「多行 shell + 引号解析」这一层可坏的东西了。
 *
 * 判定（decide）与调用分开，是为了能单测：见 secret-scan.test.mjs。那个测试能在
 * 「没装 gitleaks、甚至创建不了子进程」的环境里跑，而这正是这条脚本最容易出错的两种情形。
 *
 * 口径（改这里要同步改 lefthook.yml 的注释）：
 *   - **只扫暂存内容**（`--staged`）：工作区里躺着 apps/server/.env（gitignored）与 dist/ target/
 *     构建产物，扫它们只会报一堆根本进不了仓库的噪音——实测同一时刻「扫工作区 18 处 vs 扫暂存
 *     0 处」，18 处全是误报。git 全历史的扫描归 CI 那条（`gitleaks git`），因为「曾经提交过、
 *     后来删掉」的密钥本地扫不出来，除非扫全历史，那太慢，不该压在每个 commit 上。
 *   - **没装 gitleaks 就跳过并提示**：本地可以没有（装法 `mise install`，版本钉在仓库根
 *     mise.toml），CI 上这条是硬门禁，绕不过去。
 *   - **扫描发现泄漏 → 退出码 1**，提交被拦。
 *   - **gitleaks 起不来或异常退出 → 也失败**，不当作「没装」放过：把「没量到」当成「没问题」
 *     是门禁最坏的失效方式（探针坏了却报绿）。
 *
 * 规则与放行理由见 .gitleaks.toml；历史残留放行见 .gitleaksignore。
 */
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

import { out as makeOut } from "./lib/out.mjs"

const ROOT = resolve(import.meta.dirname, "..")

/** 与 CI 的 `gitleaks git` 同一套规则，区别只在扫的范围：这里是暂存内容 */
const SCAN_ARGS = ["git", "--pre-commit", "--staged", "--redact", "--no-banner"]

/**
 * 把一次 spawn 的结果翻译成「该做什么」。
 *
 * 抽成纯函数是为了能在没有 gitleaks、甚至不能创建子进程的环境里单测——
 * 判定本身不该依赖「能真的跑起来 gitleaks」。
 *
 * @param {{ status: number | null, error?: { code?: string, message?: string } | null }} result spawnSync 的返回
 * @returns {{ action: "skip" } | { action: "pass" } | { action: "leaks" } | { action: "fail", reason: string }}
 */
export function decide(result) {
    // 只有 ENOENT 才是「没装」。其他 spawn 错误（EBUSY / EACCES …）是环境出了问题，
    // 一律按失败处理——否则「gitleaks 明明装了却起不来」会静默变成「没装，跳过」。
    if (result.error?.code === "ENOENT") return { action: "skip" }
    if (result.error) {
        return {
            action: "fail",
            reason: `无法执行 gitleaks：${result.error.code ?? result.error.message ?? "未知错误"}`,
        }
    }
    if (result.status === 0) return { action: "pass" }
    // 1 = 发现泄漏（gitleaks 的约定）；其余非 0 是它自己出错（配置坏、参数错…），两者都拦。
    if (result.status === 1) return { action: "leaks" }
    return { action: "fail", reason: `gitleaks 异常退出（退出码 ${result.status}）` }
}

function main() {
    const o = makeOut("secret-scan")
    const result = spawnSync("gitleaks", SCAN_ARGS, { cwd: ROOT, stdio: "inherit" })
    const outcome = decide(result)

    switch (outcome.action) {
        case "skip":
            o.info("未找到 gitleaks，跳过本地密钥扫描（mise install 可装；CI 仍会拦）")
            return
        case "pass":
            return
        case "leaks":
            o.err("检测到疑似密钥（gitleaks 退出码 1）——提交已拦下，详情见上面的报告。")
            process.exitCode = 1
            return
        case "fail":
            o.err(`${outcome.reason}——提交已拦下。`)
            o.rawErr("本地密钥扫描没跑成，不要当成「扫过且干净」。")
            process.exitCode = 1
    }
}

// 只在被当作命令执行时跑；被单测 import 时不跑。
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
