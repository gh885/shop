#!/usr/bin/env node
/**
 * 数据面守卫：`pnpm db:up` / `pnpm db:down` / `pnpm dev:server`（`--hold`）。
 *
 * 背景（都是实测出来的，别再猜）：
 *
 * 1. 本仓库的 PG 18 / Redis 7 跑在 WSL2 里（见 AGENTS.md），而 **WSL 的 VM 只按「有没有 WSL 会话」
 *    存活**，空闲几十秒就把整台 VM 回收。VM 一停，共享栈（镜像网络）里的 `localhost:15432/6379`
 *    监听随之消失：
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
 *
 * ── 两种数据面，一个变量切（`SHOP_DATASTORE=wsl|remote`，默认 wsl）─────────────────────
 *
 *   默认值可以改进 `apps/server/.env` 写一行（gitignored，机器专属），于是三条命令都不用带前缀；
 *   命令行显式导出永远压得过它 —— 详见 scripts/dotenv.mjs，上面那行「数据面 …（来源）」就是它给的。
 *
 *   wsl     PG/Redis 在本机 WSL2 里。持有物 = `wsl.exe` 会话。
 *   remote  PG/Redis 在云上（`deploy/dataplane.compose.yml`）。持有物 = 一条 ssh 端口隧道。
 *
 * 选 remote 的理由不是「云更高级」，而是把上面那段 WSL 机制整个删掉：远端 PG 是 systemd/docker
 * 常驻的，不存在「空闲几十秒被回收」，于是也不需要 1.2GB 的 vmmemWSL 去按着它。
 *
 * 三种模式在两种数据面下语义一一对应，`dev:server` / `db:up` / `db:down` / `test:server`
 * 四条命令的用法不变——这是刻意的：换数据面不该改肌肉记忆。
 *
 * remote 模式下隧道的本地端口就用 15432 / 6379（全仓库 `SHOP_DB_*` 变量族的默认口径），
 * 所以接上云之后 JDBC URL、seed、e2e 一处都不用改；远端 PG 在 5433，由隧道映射过来。
 *
 * 一个如实的局限：ssh 只管「本地端口绑上了」，不看远端 5433 到底有没有人监听。所以本脚本在 remote
 * 下报的是「隧道已建立」而不是「库已就绪」——库要真不在，第一次握手由后端报 refused 来暴露，
 * 那比一个谎报就绪的守卫有用。
 */
import { spawn, spawnSync } from "node:child_process"
import net from "node:net"
import { loadDevEnv } from "./dotenv.mjs"

/** 命令行显式导出的优先，其次 apps/server/.env，最后仓库默认 wsl */
const FROM_ENV_FILE = loadDevEnv().includes("SHOP_DATASTORE")
const BACKEND = process.env.SHOP_DATASTORE ?? "wsl"
const BACKEND_FROM = FROM_ENV_FILE
    ? "apps/server/.env"
    : process.env.SHOP_DATASTORE
      ? "命令行"
      : "仓库默认"
if (BACKEND !== "wsl" && BACKEND !== "remote") {
    console.error(`✖ SHOP_DATASTORE 只认 wsl / remote，收到 "${BACKEND}"`)
    process.exit(1)
}

const DISTRO = process.env.SHOP_WSL_DISTRO ?? "Ubuntu"
/** 云主机：走 ~/.ssh/config 里的别名，密钥与代理都由它管 */
const SSH_HOST = process.env.SHOP_SSH_HOST ?? "aliyun"
/** Windows 侧 OpenSSH 与 git bash 的 ssh 不共享 agent；密钥只在前者时改这个变量 */
const SSH_BIN = process.env.SHOP_SSH_BIN ?? "ssh"
/** 远端 PG 避让 5432（同机 campus-chat-pg 在用），见 deploy/dataplane.compose.yml */
const REMOTE_DB_PORT = Number(process.env.SHOP_REMOTE_DB_PORT ?? 5433)
/** 远端 Redis 固定 6379：那是 compose publish 出来的端口，本地换端口不影响它 */
const REMOTE_REDIS_PORT = 6379

/**
 * 本地 PG 默认 15432：WSL 镜像网络共享栈，5432 被 GameViewerServer 占死（见 application.yml 注释）。
 * `remote` 模式下这些就是隧道在本地绑的端口，`remote` 字段是远端端口。
 */
const TARGETS = [
    {
        name: "PostgreSQL",
        port: Number(process.env.SHOP_DB_PORT ?? 15432),
        remote: REMOTE_DB_PORT,
    },
    {
        name: "Redis",
        port: Number(process.env.SHOP_REDIS_PORT ?? 6379),
        remote: REMOTE_REDIS_PORT,
    },
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

/**
 * 第一节先报「连的是哪台库、这个决定是谁做的」：数据面偏好可以藏在 .env 里，
 * 不报出来的话，「我到底在本地还是在云上」就变成一件要 `cat .env` 才能回答的事。
 * `--down` 两种会话一起清，报哪个都不诚实，所以只在 up / hold 报。
 */
if (MODE !== "down") {
    const target = BACKEND === "remote" ? `→ ${SSH_HOST}` : `→ WSL/${DISTRO}`
    console.log(`· 数据面 ${BACKEND}（${BACKEND_FROM}）${target}`)
}

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
    const results = await Promise.all(
        TARGETS.map((t) => isOpen(t.port).then((open) => ({ t, open }))),
    )
    return results.filter((r) => !r.open).map((r) => r.t)
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

// ── remote：ssh 隧道 ──────────────────────────────────────────────────

/** 认自己隧道用的命令行特征：只匹配「带 -N 且转发了远端 PG 端口」的 ssh，不会误杀手开的会话。
 *  这里的 `.` 当正则的通配用（要匹配的就是字面量点号），不需要转义 */
const TUNNEL_MATCH = `-N.*-L.*127.0.0.1:${REMOTE_DB_PORT}`

function tunnelArgs() {
    const forwards = TARGETS.flatMap((t) => ["-L", `${t.port}:127.0.0.1:${t.remote}`])
    return [
        "-N",
        ...forwards,
        // 链路静默断开时让 ssh 自己退出，而不是留着「本地端口还在监听、远端已经死」的半死态。
        // 退出后由 hold 的重连循环补上——那正是 WSL 模式下最阴的一种故障，别在云上复现它。
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        // 本地端口被占就直接失败，不要退化成「连上了但没转发」
        "-o",
        "ExitOnForwardFailure=yes",
        SSH_HOST,
    ]
}

/**
 * @param detached 分离模式（db:up）必须 stdio:"ignore"：留着管道会让本进程的事件循环永不结束，
 *   `pnpm db:up` 就变成不返回了。hold 模式则要接住 stderr——隧道秒退的真正原因
 *   （`Warning: remote port forwarding failed for listen port 15600`）只在 ssh 的 stderr 里。
 */
function spawnTunnel({ detached }) {
    return spawn(SSH_BIN, tunnelArgs(), {
        detached,
        stdio: detached ? "ignore" : ["ignore", "ignore", "pipe"],
    })
}

/**
 * 查「这些本地端口现在是哪个进程在 listen」，Windows 侧的 Get-NetTCPConnection 是唯一手段。
 *
 * 实测结论（15599 vs 15432 对照）：
 *   - 真 ssh 隧道 → 认得出，owner 进程名就是 `ssh`；
 *   - WSL 镜像网络的端口 → TCP 连得上，但 Windows 侧**根本没有这个 listen socket**（HNS 层截走），
 *     查不到任何属主。
 *
 * 只在 Windows 有解。非 Windows、或 powershell 调不动时返回 null —— 表示「问不出话」，
 * 不是「没人听」；调用方必须自己决定拒绝还是放过，不要当空 Map 用。
 *
 * @param {number[]} ports
 * @returns {Map<number, string> | null} port → 进程名；查不了时 null
 */
function listenerOwners(ports) {
    if (process.platform !== "win32") return null
    const script = `
        $ErrorActionPreference = 'SilentlyContinue'
        Get-NetTCPConnection -State Listen -LocalPort ${ports.join(",")} |
            ForEach-Object {
                '{0}:{1}' -f $_.LocalPort, (Get-Process -Id $_.OwningProcess).ProcessName
            }
    `
    const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
        encoding: "utf8",
    })
    // status 为 null 是被杀/超时/起不来：此时 stdout 是 null，`?? ""` 会把它当成「没人 listen」，
    // 而本函数的契约是「问不出话返回 null」，让调用方自己定性（起隧道方据此拒绝启动）。
    if (res.error || res.status === null) return null
    return new Map(
        res.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [port, name] = line.split(":")
                return [Number(port), name]
            }),
    )
}

/** 是不是本仓库数据面体系起的那条隧道 */
const isTunnelOwner = (name) => /^ssh(\.exe)?$/.test(name)

/**
 * 本地端口已经通着的时候，问一句「那是谁在听」。
 *
 * 必须问：remote 模式故意沿用 15432 / 6379 这对本地端口（好让 JDBC URL、seed、e2e 零改动），
 * 而本机 WSL 数据面用的就是同一对。不去认属主的话，WSL 还开着时 `SHOP_DATASTORE=remote` 会
 * 一路「就绪」到底——连的是本地库，测试全绿，谁也不会发现云上那套根本没接上。这种接错不报错
 * 的状态比起不来危险得多，所以宁可拒绝启动。
 *
 * 判据实测过（15599 vs 15432 对照）：
 *   - 真 ssh 隧道 → Get-NetTCPConnection 认得出，owner 进程名就是 `ssh`；
 *   - WSL 镜像网络的端口 → TCP 连得上，但 Windows 侧**根本没有这个 listen socket**（HNS 层截走），
 *     查不到任何属主。
 * 所以是 fail-closed：认不出属主 = 不是隧道 = 拒绝。只有同样来自 ssh 的监听（另开一轮
 * dev:server 的隧道）才放行。
 *
 * @returns {Promise<Array<{ port: number, name: string }>>} 通着、但不是隧道的那些
 */
async function foreignRemotePorts() {
    const unavailable = await closedPorts()
    const closedSet = new Set(unavailable.map((t) => t.port))
    const open = TARGETS.filter((t) => !closedSet.has(t.port))
    if (open.length === 0) return []
    const owners = listenerOwners(open.map((t) => t.port))
    if (owners === null) {
        // 问不出话就不猜：宁可拒绝对着「不知道端口是谁」的机器起隧道，也不静默连本地库
        console.error(`✖ ${BACKEND}=remote 时无法在 ${process.platform} 上确认端口属主`)
        console.error("  → 手工确认这两个端口确实是通往云上的隧道，或直接改用 WSL 模式")
        process.exit(1)
    }
    const suspicious = open
        .map((t) => ({ port: t.port, name: owners.get(t.port) ?? "无人认领" }))
        .filter((x) => !isTunnelOwner(x.name))
    if (suspicious.length === 0) return []
    // 「无人认领」有两种，必须分清，否则切换数据面会把自己锁死：
    //   a) 活着的 WSL 数据面（真该拒绝）；
    //   b) `wsl --shutdown` 之后还没散场的镜像网络中继 —— 实测 db:down 后有几秒仍然 accept 连接，
    //      但后面没人。此时拒绝并让人「先 pnpm db:down」是指南向的死路（他已经 down 过了）。
    // 判据是再探一次：散场的端口会开始拒连。
    await new Promise((r) => setTimeout(r, 1500))
    const recheck = await Promise.all(
        suspicious.map(async (x) => ({ x, open: await isOpen(x.port, 1200) })),
    )
    return recheck.filter((r) => r.open).map((r) => r.x)
}

/** 端口被不是隧道的东西占着 → 直接失败并给出该敲的那条命令 */
async function assertNoForeignListeners() {
    const foreign = await foreignRemotePorts()
    if (foreign.length === 0) return
    const list = foreign.map((f) => `${f.port}(${f.name})`).join("、")
    console.error(`✖ remote 模式下这些本地端口不是 ssh 隧道在听：${list}`)
    console.error(
        "  → 「无人认领」= Windows 侧没有对应的 listen socket，那是本机 WSL 镜像网络（PG/Redis）",
    )
    console.error("    先还回来：pnpm db:down")
    console.error("    确有其人要用这两个端口，就用 SHOP_DB_PORT / SHOP_REDIS_PORT 换一对")
    process.exit(1)
}

/** 只杀本脚本体系起的隧道（含被强杀留下的孤儿） */
function reapTunnels() {
    if (process.platform !== "win32") return
    spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='ssh.exe'\" | " +
                `Where-Object { $_.CommandLine -match '${TUNNEL_MATCH}' } | ` +
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { stdio: "ignore" },
    )
}

/**
 * 清掉所有保活会话（含孤儿）。
 *
 * 为啥要管孤儿：Windows 上父进程被 `/F` 强杀（`taskkill /F`、IDE 的停止按钮、直接关终端）
 * **不会**带走子进程 —— `wsl.exe ... sleep infinity` 变成孤儿继续把 VM 按着，内存就回不去。
 * 所以按命令行把它认出来一起清掉，父进程怎么死都不影响回收。
 *
 * 两种会话（WSL 会话与 ssh 隧道）一起清：这样 `SHOP_DATASTORE` 来回切时不会留下另一半在抢端口。
 */
function reapSessions() {
    reapTunnels()
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

/** vmmemWSL 的当前工作集（MB）；拿不到就返回 undefined —— 只为让「占了多少内存」可见 */
function vmmemMB() {
    if (process.platform !== "win32") return undefined
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
    return Number.isFinite(bytes) ? Math.round(bytes / 1024 / 1024) : undefined
}

function memoryNote() {
    const mb = vmmemMB()
    return mb === undefined ? "" : `，vmmemWSL 约 ${mb}MB`
}

/** wsl：拉起 VM 与两个服务（VM 起来后 systemd 会自己带起已 enable 的单元，这里再兜一层） */
function wakeWslDatastore() {
    if (process.platform !== "win32") {
        console.error(
            "✖ 端口不通且当前不是 Windows，无法自动拉起 WSL —— 请手动启动 PostgreSQL / Redis",
        )
        process.exit(1)
    }
    const startServices = [
        "systemctl start postgresql redis-server 2>/dev/null || true",
        "service postgresql start 2>/dev/null || true",
        "service redis-server start 2>/dev/null || true",
        "exit 0",
    ].join("; ")
    const res = wsl(["-u", "root", "-e", "sh", "-c", startServices])
    if (res.error) {
        console.error(`✖ 调不动 wsl.exe：${res.error.message}`)
        console.error("  → 确认发行版存在（wsl -l -v），或用 SHOP_WSL_DISTRO 指定名字")
        process.exit(1)
    }
}

/** remote：起一条 detached 隧道（`--hold` 模式不走这里，由重连循环持有） */
function wakeRemoteDatastore() {
    // 先清遗留隧道：端口被上一轮的孤儿占着时，新隧道会因 ExitOnForwardFailure 直接退出，
    // 表现成「等了 60s 还是连不上」，看不出真正原因
    reapTunnels()
    spawnTunnel({ detached: true }).unref()
}

function wakeDatastore() {
    if (BACKEND === "remote") wakeRemoteDatastore()
    else wakeWslDatastore()
}

async function ensureDatastore() {
    // 先认端口属主，再谈「通不通」：remote 下端口通着也可能是本地 WSL 在听（见 foreignRemotePorts）
    if (BACKEND === "remote") await assertNoForeignListeners()
    const ports = await closedPorts()
    if (ports.length === 0) return
    const where =
        BACKEND === "remote" ? `ssh 隧道 → ${SSH_HOST}` : `WSL 数据面（distro: ${DISTRO}）`
    console.log(`… ${TARGETS.map(label).join("、")} 连不上，拉起 ${where}`)
    wakeDatastore()
    const stillClosed = await waitForOpen(Date.now() + WAIT_MS)
    if (stillClosed.length > 0) {
        console.error(`✖ 等了 ${WAIT_MS / 1000}s 仍连不上：${stillClosed.join("、")}`)
        if (BACKEND === "remote") {
            console.error(`  → 手动验一次隧道：${SSH_BIN} ${tunnelArgs().join(" ")}`)
            console.error(
                `    （密钥不在 Windows OpenSSH 的 agent 里时，用 SHOP_SSH_BIN 指到能用的 ssh）`,
            )
        } else {
            console.error(
                `  → 进 WSL 看一眼：wsl -d ${DISTRO} -u root -- service postgresql status`,
            )
        }
        process.exit(1)
    }
}

// ── --down：立刻还内存 / 断隧道 ───────────────────────────────────────
if (MODE === "down") {
    const before = vmmemMB()
    // 两种会话一起清（见 reapSessions 注释）：切换数据面时不留另一半在抢 15432
    if (process.platform === "win32") reapSessions()
    if (BACKEND === "wsl" && process.platform === "win32") {
        spawnSync("wsl.exe", ["--shutdown"], { stdio: "ignore" })
        // `wsl --shutdown` 是异步的：等 vmmemWSL 真消失再报数（最多约 5s）
        for (let i = 0; i < 10 && vmmemMB() !== undefined; i++) {
            // oxlint-disable-next-line no-await-in-loop -- 轮询睡眠必须串行等待，无法并行
            await new Promise((r) => setTimeout(r, 500))
        }
    }
    const after = vmmemMB()
    if (BACKEND === "remote") {
        const foreign = await foreignRemotePorts()
        const note =
            foreign.length > 0
                ? `（${foreign.map((f) => `${f.port} 仍是 ${f.name} 在听`).join("、")}）`
                : ""
        console.log(`✓ 已断开隧道 → ${SSH_HOST}${note}`)
    } else {
        const afterText = after === undefined ? "0MB（VM 已退出）" : `${after}MB`
        console.log(
            before === undefined
                ? "✓ 已释放数据面（会话已杀、wsl --shutdown 已发）"
                : `✓ 已释放数据面：vmmemWSL ${before}MB → ${afterText}`,
        )
    }
    process.exit(0)
}

/**
 * 跑一条隧道直到它退出，返回它生前最后的 stderr 摘要。
 *
 * 读 stderr 不是锦上添花：pipe 而不去 drain，ssh 写满管道缓冲（约 4KB）就会卡死在那里，
 * 表现成「隧道进程在、端口却不开」，比直接退出更难查。而 ssh 报的真实原因（本地端口被占、
 * 认证失败、远端拒绝转发）只在这一路输出里。
 */
function runTunnelUntilExit(child) {
    const lines = []
    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/)) {
            const t = line.trim()
            if (t) lines.push(t)
        }
    })
    return new Promise((resolve) => {
        child.once("exit", () => resolve(lines.slice(-2).join("；") || "无输出"))
        // ssh 本身起不来（SHOP_SSH_BIN 指错、二进制不在 PATH）走的是 error 不是 exit。
        // 不接住它就是「Unhandled 'error' event + 一坨堆栈」，看不见该改什么
        child.once("error", (err) => resolve(`进程起不来：${err.message}`))
    })
}

/**
 * remote 的 `--hold`：本进程负责让一条隧道活着，掉线补一条。
 *
 * 为什么不照 WSL 那样「会话退出就 process.exit」：ssh 掉线是常态（笔记本合盖、切 Wi-Fi、
 * 云端重启），而补一条隧道是 200ms 的事。直接判死等于把一次网络抖动放大成整轮 dev 中断。
 * 真正该判死的是「补不回来」（见 MAX_FAST_FAILS）。
 */
async function holdRemoteTunnel() {
    // 先认端口属主：本地 WSL 数据面在听 15432/6379 时，静默待命就等于静默连本地库
    await assertNoForeignListeners()
    const MAX_FAST_FAILS = 8
    /** 单次重连的退避上限；链路长时间断着时不要疯狂重试刷日志 */
    const MAX_BACKOFF_MS = 15_000
    let child = null

    // 不设「正在退出」标志：信号里直接 process.exit，循环没有机会再跑到重连那一支。
    // 必须显式 kill：Windows 上父进程退出不会带走 ssh.exe，留着就是占着 15432 的孤儿隧道
    const quit = (signal) => {
        child?.kill()
        process.exit(signal === "SIGINT" ? 130 : 0)
    }
    process.on("SIGINT", () => quit("SIGINT"))
    process.on("SIGTERM", () => quit("SIGTERM"))

    const supervise = (async () => {
        let backoff = 500
        let fastFails = 0
        // oxlint-disable no-await-in-loop -- 守护循环的每一步都必须等上一步：探测 → 建隧道 → 等退出 → 退避
        for (;;) {
            const closed = await closedPorts()
            if (closed.length === 0) {
                // 端口通着：要么隧道本来就活着，要么另有会话在管（另一个 dev:server / 手开的
                // ssh）。不抢——抢了会因 ExitOnForwardFailure 秒退，把日志刷成故障的样子
                fastFails = 0
                await new Promise((r) => setTimeout(r, 3000))
                continue
            }
            const started = Date.now()
            child = spawnTunnel({ detached: false })
            const why = await runTunnelUntilExit(child)
            child = null
            const lived = Date.now() - started
            if (lived > 30_000) {
                backoff = 500
                fastFails = 0
            } else if (++fastFails >= MAX_FAST_FAILS) {
                console.error(`✖ 隧道连续 ${fastFails} 次秒退，放弃（数据面不可用）`)
                console.error(`  → 手动验一次：${SSH_BIN} ${tunnelArgs().join(" ")}`)
                process.exit(1)
            }
            // 秒退一般是本地端口被占或鉴权失败，不报出来的话只看得见日志在滚
            console.error(`· 隧道退出（存活 ${lived}ms）：${why} → ${backoff}ms 后重连 ${SSH_HOST}`)
            await new Promise((r) => setTimeout(r, backoff))
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
        // oxlint-enable no-await-in-loop
    })()

    const stillClosed = await waitForOpen(Date.now() + WAIT_MS)
    if (stillClosed.length > 0) {
        console.error(`✖ 隧道起不来，仍连不上：${stillClosed.map(label).join("、")}`)
        console.error(`  → 手动验一次：${SSH_BIN} ${tunnelArgs().join(" ")}`)
        console.error("    密钥不在 Windows OpenSSH 的 agent 里时，用 SHOP_SSH_BIN 指到能用的 ssh")
        process.exit(1)
    }
    const map = TARGETS.map((t) => `${t.port} → ${SSH_HOST}:${t.remote}`).join(" / ")
    // 只说「隧道已建立」不说「库已就绪」：ssh 在本地绑端口时并不校验远端那头的监听，
    // 远端 5433 没人听也照样绑得上。真不健康由后端第一次握手去暴露，不在这里装确认
    console.log(`✓ 隧道已建立（${map}）`)
    console.log("  隧道随本进程存活：Ctrl-C / 停掉后端即断开（也可随时 pnpm db:down）")
    await supervise
}

// ── --hold：前台持有会话，本进程退出即释放（dev:server 用）────────────
if (MODE === "hold" && BACKEND === "remote") {
    await holdRemoteTunnel()
} else if (MODE === "hold") {
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
    if (
        BACKEND === "wsl" &&
        process.platform === "win32" &&
        process.env.SHOP_WSL_KEEPALIVE !== "0"
    ) {
        // 先把上次遗留的会话（含被强杀留下的孤儿）清干净，避免叠一堆
        reapSessions()
        spawn("wsl.exe", ["-d", DISTRO, "-u", "root", "-e", "sh", "-c", `exec ${KEEPALIVE_CMD}`], {
            detached: true,
            stdio: "ignore",
        }).unref()
        console.log("  已挂 detached 会话（用完记得 pnpm db:down 还内存）")
    }
    const ready =
        BACKEND === "remote"
            ? `✓ 隧道已建立（→ ${SSH_HOST}，用完 pnpm db:down 断开）`
            : `✓ 数据面已就绪（${TARGETS.map((t) => `:${t.port}`).join(" / ")}）${memoryNote()}`
    console.log(ready)
}
