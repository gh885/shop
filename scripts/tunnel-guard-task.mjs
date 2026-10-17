#!/usr/bin/env node
/**
 * 把隧道守护注册成 Windows 计划任务：登录时自动拉起，与任何终端无关。
 *
 * ## 为什么要任务，而不是开机自启的脚本 / 常驻终端
 * 守护进程需要 ssh 的密钥与 agent（`~/.ssh/config` 里的主机别名、`SSH_AUTH_SOCK`），
 * 所以它只能以**登录用户**的身份跑，不能是 SYSTEM；也不能靠「用户的某个终端窗口开着」。
 * 计划任务的 InteractiveToken 正好是这个语义：登录后由系统拉起，跑的是用户的身份与环境。
 *
 * ## 为什么用 `schtasks /xml` 而不是它那套简写参数
 * 简写参数建的默认值对「常驻进程」全是坑，逐条都在下面 Settings 里改掉了：
 *   - `DisallowStartIfOnBatteries=true`：笔记本拔电就不启动（默认就是 true）
 *   - `StopIfGoingOnBatteries=true`：跑着跑着拔电就被停（默认 true）
 *   - `ExecutionTimeLimit=PT72H`：默认 72 小时后强杀，守护活不过三天（默认 72H）
 *   - `IdleSettings`：默认「仅在空闲时运行」，正好相反
 *
 * ## 为什么要一个 .cmd 启动器，而不是把 node 路径直接写进任务
 * 计划任务里不能写死 node 的绝对路径。mise 把 node 装在
 * `...\mise\installs\node\<version>\node.exe`，写死后一次 node 大版本升级就让任务指向
 * 不存在的文件，守护在下次登录时**静默起不来**（schtasks 只会说任务“已运行”就结束）。
 *
 * 所以任务调的是 scripts/tunnel-guard.cmd，它在**运行时**按 mise shim → PATH → mise installs
 * 顺序找 node，任何一步命中即止。升级 node 大版本不需要重装任务。
 *
 * 那个 .cmd 有两条硬约束（都踩过，改它之前先读文件头的注释）：
 *   1. **纯 ASCII**：cmd 按系统 OEM 代码页（中文 Windows 是 936）读批处理，UTF-8 的中文字节
 *      会被当成命令文本，于是满屏 `'m' is not recognized`。
 *   2. **rem 注释里不能有 `<` `>` `&` `|` `(` `)` 和落单的双引号**：cmd 会把其中一些当重定向或
 *      命令分隔符，导致脚本在第一行就静默退出——不报错、不写日志、退出码还可能看着正常。
 *      （`<version>` 这种写法就是真凶。）所以这个文件的解释性文字放在这里，中文说明也在 AGENTS.md。
 *
 * 用法：
 *   node scripts/tunnel-guard-task.mjs install     # 注册（可重复执行，幂等覆盖）
 *   node scripts/tunnel-guard-task.mjs uninstall   # 注销，并停掉正在跑的守护
 *   node scripts/tunnel-guard-task.mjs status      # 任务在不在 / 守卫生不活着
 *   node scripts/tunnel-guard-task.mjs run         # 立刻触发一次（不等到下次登录）
 */
import { spawnSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const TASK_NAME = "shop-tunnel-guard"

const LAUNCHER = fileURLToPath(new URL("./tunnel-guard.cmd", import.meta.url))
const REPO = path.resolve(import.meta.dirname, "..")
const LOG = path.join(os.homedir(), ".shop-datastore", "tunnel-guard.log")

/** 计划任务要的是 `DOMAIN\user` 形式 */
const USER = `${process.env.USERDOMAIN ?? os.hostname()}\\${process.env.USERNAME ?? os.userInfo().username}`

const xmlEscape = (s) =>
    s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")

/** 带 encoding 时类型上 stdout/stderr 是 string，但进程压根没起来时实际是 null；
 *  与 ensure-datastore.mjs / obs-stack.mjs 同一处理：运行时自己判一次 typeof。 */
const trimOrEmpty = (v) => (typeof v === "string" ? v : "").trim()

/**
 * `spawned` 必须和 `code` 分开：spawnSync 起不来进程时 status 是 null、error 有值。
 * 若把它折成 `code=1`，调用方就分不清「任务不存在」和「压根没问成」（沙箱黑名单 / EPERM），
 * 后者被当成「未注册」就是谎报——仓库口径是「量不到一律判失败」，不是「量不到就当没有」。
 */
function schtasks(args) {
    const res = spawnSync("schtasks.exe", args, { encoding: "utf8" })
    return {
        spawned: res.status !== null && !res.error,
        code: res.status ?? 1,
        out: trimOrEmpty(res.stdout),
        err: trimOrEmpty(res.stderr),
    }
}

/**
 * 把一次 `/query` 的结果定性成三态：
 * - `installed` 查得到
 * - `absent`    命令跑起来了并明确失败（任务不存在 / 无权限）
 * - `unknown`   命令没跑起来，**不代表没装**
 * @param {{ spawned: boolean, code: number }} r
 * @returns {"installed" | "absent" | "unknown"}
 */
export function classifyTaskQuery({ spawned, code }) {
    if (!spawned) return "unknown"
    return code === 0 ? "installed" : "absent"
}

/** 任务装没装（三态；`unknown` 只说明没问成，不能读作「没装」） */
export function taskState() {
    return classifyTaskQuery(schtasks(["/query", "/tn", TASK_NAME]))
}

/**
 * 布尔封装：只有「确认已注册」才是 true，`unknown` 也返回 false。
 * 所以它只适合「装了就多说一句」这类可选提示，不要拿它做判定——
 * 判定请用 `taskState()`，否则又会把「查不到」说成「没装」。
 *
 * 曾经还有一个 `taskRunning()`：靠 `/fo LIST /v` 的输出里匹配 `Status: Running`。
 * 删掉是因为它两头都不可信——中文系统的输出是「状态: 正在运行」，正则永远匹配不到（假阴性）；
 * 而「任务实例在跑」也不等于「隧道在位」（ssh 可能正在退避重连）。隧道到底通没通，
 * 端口探活才是真相，见 db-status.mjs。
 */
export function taskInstalled() {
    return taskState() === "installed"
}

function buildXml() {
    return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Shop 数据面隧道守护（remote 模式，断线自愈）。由 scripts/ensure-datastore.mjs --tunnel-guard 执行，日志：${xmlEscape(LOG)}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xmlEscape(USER)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(USER)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c ""${xmlEscape(LAUNCHER)}""</Arguments>
      <WorkingDirectory>${xmlEscape(REPO)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`
}

function install() {
    // schtasks /xml 要求 UTF-16 且带 BOM，写成 utf8 会被它当坏文件
    const tmp = path.join(os.tmpdir(), "shop-tunnel-guard.xml")
    writeFileSync(tmp, `﻿${buildXml()}`, "utf16le")

    const r = schtasks(["/create", "/tn", TASK_NAME, "/xml", tmp, "/f"])
    rmSync(tmp, { force: true })
    // 没跑起来和跑起来被拒是两件事：前者说「需要管理员」会把人指错方向
    if (!r.spawned) {
        console.error(`✖ 无法执行 schtasks（${r.err || "命令没启动"}）`)
        process.exit(1)
    }
    if (r.code !== 0) {
        console.error(`✖ 注册计划任务失败：${r.err || r.out}`)
        console.error("  → 需要能创建计划任务的权限：用管理员身份跑一次这个命令")
        process.exit(1)
    }
    console.log(`✓ 已注册计划任务「${TASK_NAME}」（登录时以 ${USER} 身份拉起）`)
    console.log(`  动作：cmd.exe /c "${LAUNCHER}"`)
    console.log("  启动器在运行时解析 node（mise shim → PATH → mise installs），不写死版本路径")
    console.log(`  日志：${LOG}`)
    console.log(
        "  注意：注册只保证「下次登录起」。现在就起一条，跑 `pnpm guard run` 或 `pnpm db:up`。",
    )
}

function uninstall() {
    // /end 先停正在跑的任务，否则注销不掉
    schtasks(["/end", "/tn", TASK_NAME])
    const r = schtasks(["/delete", "/tn", TASK_NAME, "/f"])
    // 以 /delete 的结果为准。不能拿 /query 的 unknown 去说「本来就没装」——
    // 那只说明没问成，注销可能压根没执行。
    if (r.code === 0) {
        console.log(`✓ 已注销计划任务「${TASK_NAME}」（下次登录不再自动拉起）`)
    } else if (taskState() === "absent") {
        console.log(`· 计划任务「${TASK_NAME}」本来就没装`)
    } else {
        console.error(`✖ 注销失败：${r.err || r.out || "schtasks 没跑起来"}`)
        process.exit(1)
    }
    if (existsSync(LOG)) console.log(`  历史日志仍在：${LOG}`)
}

function status() {
    const state = taskState()
    if (state === "unknown") {
        console.log(`计划任务「${TASK_NAME}」：查不到（schtasks 执行失败，不代表没装）`)
        console.log(`  → 手动确认：schtasks /query /tn ${TASK_NAME}`)
        return
    }
    console.log(`计划任务「${TASK_NAME}」：${state === "installed" ? "已注册" : "未注册"}`)
    if (state === "absent") {
        console.log("  → 装：`pnpm guard install`")
        return
    }
    const r = schtasks(["/query", "/tn", TASK_NAME, "/fo", "LIST", "/v"])
    // 只筛英文键名：中文系统的输出是「状态:」这类本地化文本，且经管道按 utf8 解码会乱码，
    // 硬凑中文正则也匹配不上。筛不到就什么都不打印，下面直接给出原始查询命令兜底。
    const detail = r.out
        .split(/\r?\n/)
        .filter((line) =>
            /^(TaskName|Status|Next Run Time|Last Run Time|Last Result|Task To Run|Logon Trigger|Schedule Type)/i.test(
                line,
            ),
        )
    if (detail.length > 0) console.log(detail.map((line) => `  ${line.trim()}`).join("\n"))
    else console.log(`  （详情行未解析，原始查询：schtasks /query /tn ${TASK_NAME} /fo LIST /v）`)
    console.log(`  日志：${existsSync(LOG) ? LOG : `（还没有日志：${LOG}）`}`)
}

function run() {
    const state = taskState()
    if (state === "unknown") {
        console.error(
            `✖ 查不到计划任务状态（schtasks 执行失败），先手动确认：schtasks /query /tn ${TASK_NAME}`,
        )
        process.exit(1)
    }
    if (state === "absent") {
        console.error(`✖ 任务「${TASK_NAME}」没装，先跑 pnpm guard install`)
        process.exit(1)
    }
    const r = schtasks(["/run", "/tn", TASK_NAME])
    if (!r.spawned || r.code !== 0) {
        console.error(`✖ 触发失败：${r.err || r.out || "schtasks 没跑起来"}`)
        process.exit(1)
    }
    console.log("· 已触发，等待守护拉起隧道（~3s）")
}

/**
 * 只在「作为入口被直接执行」时才走 CLI；被 import 时只导出上面的查询函数——
 * ensure-datastore.mjs 的 `--down` 要读任务在不在，import 一个会自己跑 CLI 的模块会直接起飞。
 */
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename
if (isEntry) {
    const MODE = process.argv[2] ?? "status"
    if (MODE === "install") install()
    else if (MODE === "uninstall") uninstall()
    else if (MODE === "status") status()
    else if (MODE === "run") run()
    else {
        console.error(`未知模式：${MODE}`)
        console.error("用法：install | uninstall | status | run")
        process.exit(1)
    }
}
