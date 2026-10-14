#!/usr/bin/env node
/**
 * 契约漂移检查（`pnpm sdk:drift`，跑在 lefthook pre-push 与 CI）：
 *   1) 离线部分：用已提交的 openapi/api-docs.json 重新生成 SDK（含 zod 校验 schema），
 *      与提交的生成物比对 —— 保证 src/sdk 与契约文件同步；
 *   2) 在线部分：若本地后端在跑，再比对运行中后端的 /v3/api-docs 与提交的契约文件 ——
 *      保证契约文件本身没有落后于代码。后端没起就跳过，不阻塞推送。
 *
 * 为什么是 node 而不是 bash（2026-10 从 scripts/check-sdk-drift.sh 迁过来）：
 *   Windows 上 `bash` 会被 System32 的 WSL 启动器抢走，而默认发行版不一定有 /bin/bash
 *   （这台机器 `bash` 解析到 docker-desktop，实测 `execvpe(/bin/bash) failed`）。于是同一条命令
 *   在 lefthook 里能过、在普通终端里跑不起来（`pnpm sdk:drift` 就是这个坑的现场）。仓库里
 *   其余脚本都是 node，不留这个特例。
 *
 * 生成到临时目录只比对，绝不写 packages/api/src/sdk：生成器落笔前会清掉输出目录，而 pre-push
 * 是并行的 —— tsc/oxlint/vitest 正开着那里的文件时 Windows 删除报 EPERM，旧文件已删、新文件
 * 没写完，半截生成物会把 typecheck/lint/test 一起带红（实测）。
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const API_PKG = join(ROOT, "packages/api")
const SDK_DIR = join(API_PKG, "src/sdk")
/** 直接跑包内 bin 的入口文件（不是 .cmd/.ps1 shim）：跨平台、不经过 shell、不额外联网 */
const OPENAPI_TS = join(API_PKG, "node_modules/@hey-api/openapi-ts/bin/run.js")
const CONTRACT = join(ROOT, "openapi/api-docs.json")
const NORMALIZE_SDK = join(ROOT, "scripts/contracts/normalize-sdk.mjs")
const LIVE_URL = "http://localhost:8080/v3/api-docs"
/** 差异输出上限，与迁移前的 `diff -r | head -20` 对齐 */
const MAX_DIFF_LINES = 20

/** 递归收集目录下的文件：相对路径（统一用 `/`）→ 绝对路径 */
function walk(dir) {
    const files = new Map()
    const stack = [dir]
    while (stack.length > 0) {
        const current = stack.pop()
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = join(current, entry.name)
            if (entry.isDirectory()) stack.push(full)
            else files.set(relative(dir, full).split(sep).join("/"), full)
        }
    }
    return files
}

/** 两份文本第一个不同的行，用于把差异说得比「文件不同」具体一点 */
function firstDifferingLine(a, b) {
    const left = a.toString("utf8").split("\n")
    const right = b.toString("utf8").split("\n")
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        if (left[i] !== right[i])
            return { line: i + 1, left: left[i] ?? "<无此行>", right: right[i] ?? "<无此行>" }
    }
    return undefined
}

/** 比对两棵目录树，返回可直接打印的差异行（最多 MAX_DIFF_LINES 行） */
function diffTrees(repoDir, generatedDir) {
    const repo = walk(repoDir)
    const generated = walk(generatedDir)
    const lines = []

    for (const [rel, full] of repo) {
        if (!generated.has(rel)) {
            lines.push(`只有仓库里有：${rel}（重新生成后没产出这个文件）`)
            continue
        }
        const left = readFileSync(full)
        const right = readFileSync(generated.get(rel))
        if (left.equals(right)) continue
        const detail = firstDifferingLine(left, right)
        if (detail) {
            lines.push(`内容不同：${rel}:${detail.line}`)
            lines.push(`< ${detail.left}`)
            lines.push(`> ${detail.right}`)
        } else {
            // 行都一样却字节不同：行尾符（CRLF/LF）或编码差异，这类最难肉眼发现
            lines.push(`字节不同（行内容一致，多半是行尾符/编码）：${rel}`)
        }
    }
    for (const rel of generated.keys()) {
        if (!repo.has(rel)) lines.push(`只有生成物里有：${rel}（仓库里缺这个文件）`)
    }
    return lines.slice(0, MAX_DIFF_LINES)
}

/** 归一化 JSON：比「语义相等」而不是比字节（键序、空白都不该算漂移） */
function normalize(json) {
    return JSON.stringify(JSON.parse(json))
}

/** 探一次运行中的后端契约：后端没起 / 非 2xx / 超时都算「不在场」 */
async function fetchLiveContract() {
    try {
        const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(2000) })
        if (!res.ok) return undefined
        return await res.text()
    } catch {
        return undefined
    }
}

function verifyTemporaryOutput(directory) {
    const parent = realpathSync(tmpdir())
    const target = existsSync(directory) ? realpathSync(directory) : resolve(directory)
    if (!target.startsWith(parent + sep) || !basename(target).startsWith("shop-sdk-drift-")) {
        throw new Error("Unsafe SDK temporary output: " + target)
    }
}

let fail = false

// ---- 1) SDK 生成物 vs 提交的 api-docs.json（离线）----
const tmpSdk = mkdtempSync(join(tmpdir(), "shop-sdk-drift-"))
verifyTemporaryOutput(tmpSdk)
let generated = false
let diffs = []
try {
    // stdout 丢掉（生成器很吵），stderr 留着：生成失败时那才是唯一线索
    const gen = spawnSync(process.execPath, [OPENAPI_TS, "--no-log-file", "-o", tmpSdk], {
        cwd: API_PKG,
        stdio: ["ignore", "ignore", "inherit"],
    })
    if (gen.error || gen.status !== 0) {
        console.error(
            `✖ SDK 重新生成失败（${gen.error?.message ?? `exit ${gen.status}`}），无法比对`,
        )
    } else {
        const normalized = spawnSync(process.execPath, [NORMALIZE_SDK, tmpSdk], {
            cwd: API_PKG,
            stdio: ["ignore", "ignore", "inherit"],
        })
        if (normalized.error || normalized.status !== 0) {
            console.error("✖ SDK 生成后规范化失败，无法比对")
        } else {
            generated = true
            diffs = diffTrees(SDK_DIR, tmpSdk)
        }
    }
} finally {
    // 临时目录必须收干净（等价于原 bash 的 trap ... EXIT）；失败时唯一的线索在上面那条 stderr
    verifyTemporaryOutput(tmpSdk)
    rmSync(tmpSdk, { recursive: true, force: true })
}

if (!generated) {
    fail = true
} else if (diffs.length === 0) {
    console.log("✓ SDK 生成物与 api-docs.json 同步")
} else {
    console.error("✖ packages/api/src/sdk 与 openapi/api-docs.json 不同步（前 20 行差异）")
    for (const line of diffs) console.error(line)
    console.error(
        "  → 跑 pnpm --filter @shop/api exec openapi-ts 重新生成后连同本次改动一起提交，再推送",
    )
    fail = true
}

// ---- 2) 提交的 api-docs.json vs 运行中的后端（在线，可选）----
const live = await fetchLiveContract()
if (live === undefined) {
    console.log("○ 后端未启动（localhost:8080），跳过在线契约比对")
} else if (normalize(live) === normalize(readFileSync(CONTRACT, "utf8"))) {
    console.log("✓ api-docs.json 与运行中的后端一致")
} else {
    console.error("✖ 运行中的后端契约与 openapi/api-docs.json 不一致 → 先 pnpm sdk:gen 更新并提交")
    fail = true
}

process.exit(fail ? 1 : 0)
