#!/usr/bin/env node
/**
 * 数据面状态总览（`pnpm db:status`）：纯读，不改任何状态、不起隧道、不碰计划任务。
 *
 * 它把分散的状态合成一眼能看的东西——连的是哪台库（remote/wsl）、两个本地端口通没通、
 * 登录自启的守护任务装没装——替掉「库连不上时去翻 ensure-datastore.mjs 注释、
 * 又分别跑探针和 `guard status`」的折腾。出事先跑这条。
 *
 * 端口与数据面偏好的口径来自 `datastore.mjs`（单一真相源），计划任务状态来自
 * `tunnel-guard-task.mjs` 导出的 `taskState()`——都 import，不手抄。
 *
 * 这里**不报守护的运行状态**，只报端口。两个原因：
 *   1. 「任务实例在跑」≠「隧道在位」（ssh 可能正在退避重连），端口探活才是真相；
 *   2. 判断运行状态只能解析 `schtasks /fo LIST /v` 的文本，而那是本地化的
 *      （中文系统输出「状态: 正在运行」），按 utf8 读管道还会乱码——判不准就别报。
 */
import { loadDevEnv } from "./dotenv.mjs"
import { datastoreMode, datastoreTargets, isOpen } from "./datastore.mjs"
import { TASK_NAME, taskState } from "./tunnel-guard-task.mjs"

loadDevEnv()

// 1200ms：比快速轮询宽松、比保守探针快一点——一次性诊断宁可多等半秒，也别把「慢但在起」报成「连不上」
const PROBE_MS = 1200

const mode = datastoreMode()
const results = await Promise.all(
    datastoreTargets().map((t) => isOpen(t.port, PROBE_MS).then((open) => ({ t, open }))),
)

console.log(`· 数据面 ${mode}（${mode === "remote" ? "云上，经 ssh 隧道" : "本机 WSL2"}）`)
for (const { t, open } of results) {
    console.log(
        `  ${t.name.padEnd(10)} :${String(t.port).padEnd(5)} ${open ? "✓ 在位" : "✗ 连不上"}`,
    )
}

const allOpen = results.every((r) => r.open)
// 三态：查不到 ≠ 没装（schtasks 起不来时 taskState() 返回 unknown，见 tunnel-guard-task.mjs）
const task = process.platform === "win32" ? taskState() : "unknown"

if (process.platform === "win32") {
    const guard =
        task === "installed"
            ? "已注册"
            : task === "absent"
              ? "未注册"
              : "查不到（schtasks 执行失败，不代表没装）"
    console.log(`· 隧道守护计划任务「${TASK_NAME}」：${guard}`)
}

console.log("")
if (allOpen) {
    console.log("数据面就绪，可直接 `pnpm dev:server` / `pnpm test:server`。")
} else if (mode === "remote") {
    console.log("起它：`pnpm db:up`（本次临时起，断线由守护自愈）。")
    // 计划任务这套只在 Windows 有；别的平台 `db:up` 起的就是后台守护，没有第二句话可说
    if (process.platform === "win32") {
        if (task === "absent") {
            console.log(
                "   想彻底不依赖终端：`pnpm guard install` 注册登录自启，再 `pnpm guard run` 立刻起一条。",
            )
        } else if (task === "installed") {
            console.log(
                "   守护任务已注册但隧道没起：`pnpm guard run` 立刻拉起；仍不通就 `pnpm db:up` 看报错。",
            )
        } else {
            console.log(`   任务状态未知，先手动确认：schtasks /query /tn ${TASK_NAME}`)
        }
    }
    console.log(
        "   反复连不上：查 apps/server/.env 的 SHOP_SSH_HOST，以及 ssh 密钥是否在所用 agent 里。",
    )
} else {
    console.log("起它：`pnpm db:up`（拉起 WSL VM 与 PG/Redis，首次约 30~60s）。")
}
