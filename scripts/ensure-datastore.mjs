#!/usr/bin/env node
/**
 * 数据面守卫：`pnpm db:up` / `pnpm db:down` / `pnpm dev:server`（`--hold`）。
 *
 * 背景（都是实测出来的，别再猜）：
 *
 * 1. 本仓库的 PG 18 / Redis 7 跑在 WSL2 里（见 AGENTS.md），而 **WSL 的 VM 只按「有没有 WSL 会话」
 *    存活**，空闲几十秒就把整台 VM 回收。VM 一停，Windows 侧 `127.0.0.1:5432` 的转发随之消失：
 *    - 后端启动失败：`Connection to 127.0.0.1:5432 refused`（看着像数据库没起来，改 JDBC 没用）；
 *    - 更阴的一种：后端已经跑起来也会变僵尸 —— Tomcat 还在 8080 接请求，但每个查库接口都超时。
 * 2. **网络流量不算会话**：实测后端跑着、每 20s 打一次查库接口，第二个请求就 000、VM 照样停。
 *    所以「有请求就不会被回收」这条路是不存在的。
 * 3. 配置项也救不了：`vmIdleTimeout` 在本版本被接受但不生效，`instanceIdleTimeout` 是未知键，
 *    一次性 `wsl -e sh -c 'nohup sleep &'` 里的后台进程会随会话一起被拔掉。
 *
 * 唯一能用的是「留一个 Windows 侧的 `wsl.exe` 会话」——但这个会话要按需存在，不是常驻：
 * VM 活着时 `vmmemWSL` 工作集约 1.2GB，白挂着就是白占（这正是这台机器上 WSL 的账）。
 *
 * 所以三种模式：
 *
 *   --hold   前台持有会话（`pnpm dev:server` 用）：后端进程活着 = 数据面活着，后端一停就释放
 *   （默认）  拉起数据面 + 挂一个 detached 会话（`pnpm db:up`）：给「从 IDE 跑后端」的用法兜底，
 *           用完记得 `pnpm db:down`
 *   --down   杀掉会话并 `wsl --shutdown`，立刻把内存还给 Windows（`pnpm db:down`）
 */
import { spawn, spawnSync } from "node:child_process"
import net from "node:net"

const DISTRO = process.env.SHOP_WSL_DISTRO ?? "Ubuntu"
const TARGETS = [
    { port: 5432, name: "PostgreSQL" },
    { port: 6379, name: "Redis" },
]
/** 冷启动（叫醒 VM + 起两个服务）在机械盘上可能要十几秒 */
const WAIT_MS = 60_000
/** detached 会话的存活时长；也是「已有会话」的识别串：pgrep -f 'sleep 43200' */
const KEEPALIVE_CMD = "sleep 43200"
/** `--hold` 前台会话的命令（认孤儿时也用它） */
const HOLD_CMD = "sleep infinity"

const MODE = process.argv.includes("--down")
    ? "down"
    : process.argv.includes("--hold")
      ? "hold"
      : "up"
const label = (t) => `${t.name}(:${t.port})`

/** 探一次端口：能连上 = WSL 的 VM 在跑且端口转发存在 */
function isOpen(port, timeoutMs = 800) {
    return new Promise((resolve) => {
        const socket = net.connect({ host: "127.0.0.1", port })
        const done = (ok) => {
            socket.destroy()
            resolve(ok)
        }
        socket.setTimeout(timeoutMs)
        socket.once("connect", () => done(true))
        socket.once("timeout", () => done(false))
        socket.once("error", () => done(false))
    })
}

async function closedPorts() {
    const closed = []
    for (const t of TARGETS) {
        if (!(await isOpen(t.port))) closed.push(t)
    }
    return closed
}

/** 轮询到全部端口可用；超时则返回仍连不上的那些名字 */
async function waitForOpen(deadline) {
    const closed = await closedPorts()
    if (closed.length === 0) return []
    if (Date.now() > deadline) return closed.map(label)
    await new Promise((r) => setTimeout(r, 500))
    return waitForOpen(deadline)
}

function wsl(args, opts = {}) {
    return spawnSync("wsl.exe", ["-d", DISTRO, ...args], { stdio: "ignore", ...opts })
}

/**
 * 清掉所有保活会话（含孤儿）。
 *
 * 为啥要管孤儿：Windows 上父进程被 `/F` 强杀（`taskkill /F`、IDE 的停止按钮、直接关终端）
 * **不会**带走子进程 —— `wsl.exe ... sleep infinity` 变成孤儿继续把 VM 按着，内存就回不去。
 * 所以按命令行把它认出来一起清掉，父进程怎么死都不影响回收。
 */
function reapSessions() {
    if (process.platform !== "win32") return
    wsl([
        "-u",
        "root",
        "-e",
        "sh",
        "-c",
        `pkill -f '${HOLD_CMD}'; pkill -f '${KEEPALIVE_CMD}'; exit 0`,
    ])
    spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='wsl.exe'\" | " +
                `Where-Object { $_.CommandLine -match 'sleep (${HOLD_CMD}|${KEEPALIVE_CMD})' } | ` +
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { stdio: "ignore" },
    )
}

/** vmmemWSL 的当前工作集（MB）；拿不到就返回 null —— 只为让「占了多少内存」可见 */
function vmmemMB() {
    if (process.platform !== "win32") return null
    const res = spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            "(Get-Process vmmemWSL -ErrorAction SilentlyContinue).WorkingSet64",
        ],
        { encoding: "utf8" },
    )
    // spawnSync 失败时 stdout 是 null（类型上不会体现，所以不能靠 `?? ""` 兜底——
    // 那是类型系统说多余的防御）。判 res.error 更实在：拿不到就 NaN，落到下面统一返回"拿不到"。
    const bytes = res.error ? Number.NaN : Number.parseInt(res.stdout.trim(), 10)
    return Number.isFinite(bytes) ? Math.round(bytes / 1024 / 1024) : null
}

function memoryNote() {
    const mb = vmmemMB()
    return mb === null ? "" : `，vmmemWSL 约 ${mb}MB`
}

/** 拉起 VM 与两个服务（VM 起来后 systemd 会自己带起已 enable 的单元，这里再兜一层） */
function wakeDatastore() {
    if (process.platform !== "win32") {
        console.error(
            "✖ 端口不通且当前不是 Windows，无法自动拉起 WSL —— 请手动启动 PostgreSQL / Redis",
        )
        process.exit(1)
    }
    const remote = [
        "systemctl start postgresql redis-server 2>/dev/null || true",
        "service postgresql start 2>/dev/null || true",
        "service redis-server start 2>/dev/null || true",
        "exit 0",
    ].join("; ")
    const res = wsl(["-u", "root", "-e", "sh", "-c", remote])
    if (res.error) {
        console.error(`✖ 调不动 wsl.exe：${res.error.message}`)
        console.error("  → 确认发行版存在（wsl -l -v），或用 SHOP_WSL_DISTRO 指定名字")
        process.exit(1)
    }
}

async function ensureDatastore() {
    if ((await closedPorts()).length === 0) return
    console.log(`… ${TARGETS.map(label).join("、")} 连不上，拉起 WSL 数据面（distro: ${DISTRO}）`)
    wakeDatastore()
    const stillClosed = await waitForOpen(Date.now() + WAIT_MS)
    if (stillClosed.length > 0) {
        console.error(`✖ 等了 ${WAIT_MS / 1000}s 仍连不上：${stillClosed.join("、")}`)
        console.error(`  → 进 WSL 看一眼：wsl -d ${DISTRO} -u root -- service postgresql status`)
        process.exit(1)
    }
}

// ── --down：立刻还内存 ────────────────────────────────────────────────
if (MODE === "down") {
    const before = vmmemMB()
    if (process.platform === "win32") {
        reapSessions()
        spawnSync("wsl.exe", ["--shutdown"], { stdio: "ignore" })
        // `wsl --shutdown` 是异步的：等 vmmemWSL 真消失再报数（最多约 5s）
        for (let i = 0; i < 10 && vmmemMB() !== null; i++) {
            await new Promise((r) => setTimeout(r, 500))
        }
    }
    const after = vmmemMB()
    const afterText = after === null ? "0MB（VM 已退出）" : `${after}MB`
    console.log(
        before === null
            ? "✓ 已释放数据面（会话已杀、wsl --shutdown 已发）"
            : `✓ 已释放数据面：vmmemWSL ${before}MB → ${afterText}`,
    )
    process.exit(0)
}

// ── --hold：前台持有会话，本进程退出即释放（dev:server 用）────────────
if (MODE === "hold") {
    await ensureDatastore()
    if (process.platform !== "win32") {
        console.log(`✓ 数据面已就绪（${TARGETS.map((t) => `:${t.port}`).join(" / ")}）`)
        process.exit(0)
    }
    const session = spawn("wsl.exe", ["-d", DISTRO, "-u", "root", "-e", "sh", "-c", HOLD_CMD], {
        stdio: "ignore",
    })
    const release = (signal) => {
        session.kill()
        process.exit(signal === "SIGINT" ? 130 : 0)
    }
    process.on("SIGINT", () => release("SIGINT"))
    process.on("SIGTERM", () => release("SIGTERM"))
    session.on("exit", () => process.exit(0))
    console.log(`✓ 数据面已就绪（${TARGETS.map((t) => `:${t.port}`).join(" / ")}）${memoryNote()}`)
    console.log("  会话随本进程存活：Ctrl-C / 停掉后端即释放内存（也可随时 pnpm db:down）")
} else {
    // ── 默认：db:up ──────────────────────────────────────────────────
    await ensureDatastore()
    if (process.platform === "win32" && process.env.SHOP_WSL_KEEPALIVE !== "0") {
        // 先把上次遗留的会话（含被强杀留下的孤儿）清干净，避免叠一堆
        reapSessions()
        spawn("wsl.exe", ["-d", DISTRO, "-u", "root", "-e", "sh", "-c", `exec ${KEEPALIVE_CMD}`], {
            detached: true,
            stdio: "ignore",
        }).unref()
        console.log("  已挂 detached 会话（用完记得 pnpm db:down 还内存）")
    }
    console.log(`✓ 数据面已就绪（${TARGETS.map((t) => `:${t.port}`).join(" / ")}）${memoryNote()}`)
}
