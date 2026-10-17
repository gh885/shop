#!/usr/bin/env node
/**
 * 本机可观测性栈：Prometheus + Alertmanager + Grafana —— **全部跑在 Windows 本机**。
 *
 * ## 为什么是 Windows 而不是 WSL
 * 三个组件原来跑在 WSL（systemd 托管）。但 WSL 镜像网络的 **Windows→WSL 回环会自己失效**：
 * 服务在 WSL 里 200，Windows 侧 127.0.0.1 就是 000，绑 0.0.0.0 走 WSL IP 也不通（镜像模式如此）。
 * 症状是「看板时好时坏、莫名访问不了」。这台机器的 `~/.wslconfig` 注释也记了这个坑
 * （「WSL 回收 VM → 端口消失」「别指望配置项」）。
 * 把三个组件搬到 Windows 本机后：Prometheus 抓后端（也在 Windows）、Grafana 查 Prometheus、
 * 浏览器打开 Grafana——三条全是 Windows 本地回环，**没有 WSL 参与**，一次到位。
 * 只搬 Grafana 是不够的：它要拉 Prometheus 的数据，Prometheus 留 WSL 就会把不稳的回环引进查询。
 *
 * ## 谁在采集
 * 后端 Spring Boot 自己把指标导出到 /actuator/prometheus，Prometheus 每 15s 拉一次（Pull）。
 * Grafana **不采集**，它只用 PromQL 问 Prometheus；告警由 Prometheus 加载 prometheus/shop-alerts.yml
 * 后推给 Alertmanager——别在 Grafana 里再配一套告警。
 *
 * ## 状态与安装位置
 * 全部落在 `~/.shop-obs`（bin / conf / data / logs / run），与仓库分离；配置与看板直接读
 * 仓库（改了看板不用重装，Grafana 自己轮询加载）。二进制校验 sha256——静态二进制「下载即执行」
 * 没有包管理器签名兜底，必须自己核对。
 *
 * ## 开机自启
 * 计划任务「shop-obs-stack」：登录时调 `obs up`（幂等）。
 * 三个组件本身以 detached 进程方式常驻，任务跑完即退，生命周期归 Windows。
 *
 * 用法：
 *   node scripts/obs-stack.mjs dev      # **看效果用这个**：前台跑三个组件，日志打在你终端，Ctrl-C 全停
 *   node scripts/obs-stack.mjs up       # 后台常驻（detached + windowsHide，不弹窗）+ 健康探测
 *   node scripts/obs-stack.mjs status   # 各组件状态、抓取目标健康度
 *   node scripts/obs-stack.mjs down     # 停三个组件并清 pid
 *
 * dev 与 up 怎么选：dev 不 detached，子进程共用你的终端控制台，因此**绝不弹窗**、
 * 日志可见、Ctrl-C 一次全清、不留后台——想「看一眼效果」永远用 dev。
 * up 是常驻（配合计划任务开机自启），用 windowsHide 隐藏控制台。
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const MODE = process.argv[2] ?? "up"

/** 安装与状态根。与隧道守护的 ~/.shop-datastore 分开：那些是数据面，这是监控。 */
const ROOT = path.join(os.homedir(), ".shop-obs")
const BIN = path.join(ROOT, "bin")
const CONF = path.join(ROOT, "conf")
const DATA = path.join(ROOT, "data")
const LOGS = path.join(ROOT, "logs")
const RUN = path.join(ROOT, "run")
const CACHE = path.join(ROOT, "cache")
/**
 * 三个组件的端口只有这一处定义（单元/探针/状态输出/文档都从它取）。
 * Grafana 用 3100 而不是默认 3000：3000 是各类 dev server 的传统默认位，本机前端一跑就撞。
 */
const PORTS = { grafana: 3100, prometheus: 9090, alertmanager: 9093 }

const COMPONENTS = [
    {
        id: "prometheus",
        version: "3.15.0",
        url: "https://github.com/prometheus/prometheus/releases/download/v3.15.0/prometheus-3.15.0.windows-amd64.zip",
        sumsUrl:
            "https://github.com/prometheus/prometheus/releases/download/v3.15.0/sha256sums.txt",
        archive: "prometheus-3.15.0.windows-amd64.zip",
        dir: "prometheus-3.15.0.windows-amd64",
        exe: "prometheus.exe",
        probe: ["--version"],
        port: PORTS.prometheus,
        ready: "/-/ready",
    },
    {
        id: "alertmanager",
        version: "0.28.1",
        url: "https://github.com/prometheus/alertmanager/releases/download/v0.28.1/alertmanager-0.28.1.windows-amd64.zip",
        sumsUrl:
            "https://github.com/prometheus/alertmanager/releases/download/v0.28.1/sha256sums.txt",
        archive: "alertmanager-0.28.1.windows-amd64.zip",
        dir: "alertmanager-0.28.1.windows-amd64",
        exe: "alertmanager.exe",
        probe: ["--version"],
        port: PORTS.alertmanager,
        ready: "/-/ready",
    },
    {
        id: "grafana",
        version: "13.2.3",
        url: "https://dl.grafana.com/oss/release/grafana-13.2.3.windows-amd64.zip",
        sumsUrl: "https://dl.grafana.com/oss/release/grafana-13.2.3.windows-amd64.zip.sha256",
        archive: "grafana-13.2.3.windows-amd64.zip",
        dir: "grafana-13.2.3",
        // Windows 包里是 grafana.exe（Linux 那边是 bin/grafana）
        exe: path.join("bin", "grafana.exe"),
        probe: ["--version"],
        port: PORTS.grafana,
        ready: "/api/health",
    },
]

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function fail(msg, hint) {
    console.error(`✖ ${msg}`)
    if (hint) console.error(`  → ${hint}`)
    process.exit(1)
}

/** 仓库在 Windows 下的绝对路径（配置与看板直接读仓库） */
function repoRoot() {
    return path.resolve(import.meta.dirname, "..")
}

function text(value) {
    return typeof value === "string" ? value : ""
}

// ── 探测 ──────────────────────────────────────────────────────────────────

/** 一个端口能不能连上（Windows 本机 TCP 探测） */
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
        COMPONENTS.map((c) => isOpen(c.port).then((open) => ({ c, open }))),
    )
    return results.filter((r) => !r.open).map((r) => r.c)
}

// ── 安装（up 时幂等执行）───────────────────────────────────────────────────

/** 校验并安装一个组件：已装就跳过，否则下载→校 sha256→解压。 */
function ensureComponent(c) {
    const dir = path.join(BIN, c.id)
    const probeExe = path.join(dir, c.exe)
    if (
        existsSync(probeExe) &&
        spawnSync(probeExe, c.probe, { stdio: "ignore", timeout: 30_000 }).status === 0
    ) {
        return `已装 ${c.id} ${c.version}`
    }

    const zip = path.join(CACHE, c.archive)
    // 下载（断点续传：grafana 的 windows 包 ~400MB，这台机器到 dl.grafana.com 只有 ~0.8MB/s 且会断）
    const dl = spawnSync(
        "curl.exe",
        ["-fsSL", "--retry", "3", "--retry-delay", "2", "-C", "-", "-m", "900", "-o", zip, c.url],
        { stdio: "ignore", timeout: 20 * 60 * 1000 },
    )
    if (dl.status !== 0 && !existsSync(zip))
        fail(`下载 ${c.id} 失败`, `手动：curl -fL -C - -o <path> ${c.url}`)

    // 校验和：prometheus/alertmanager 是整包 sha256sums.txt；grafana 是单文件 .sha256（裸 hash）
    const sumFile = path.join(CACHE, `${c.archive}.sha256`)
    spawnSync("curl.exe", ["-fsSL", "-o", sumFile, c.sumsUrl], { stdio: "ignore", timeout: 60_000 })
    let expected
    if (c.id === "grafana") {
        expected = text(readFileSync(sumFile, "utf8")).trim().split(/\s+/)[0]
    } else {
        const sums = text(readFileSync(sumFile, "utf8"))
        expected = sums
            .split(/\r?\n/)
            .find((l) => l.trim().endsWith(c.archive))
            ?.split(/\s+/)[0]
    }
    // 算包哈希。用 Node 的 crypto 而不是 certutil：certutil 的输出是**本地化**的
    // （中文系统上标题是「SHA256 的 ... 哈希:」），按英文正则解析会拿到空串，
    // 于是一个校验正确的包也会报“不符”——这个坑真踩过。
    const actualHash = createHash("sha256").update(readFileSync(zip)).digest("hex")
    if (!expected || expected.length !== 64)
        fail(`取不到 ${c.id} 的官方 sha256`, `检查 ${c.sumsUrl}`)
    if (expected.toLowerCase() !== actualHash.toLowerCase()) {
        fail(
            `${c.id} 包与官方 sha256 不符`,
            `期望 ${expected} 实得 ${actualHash}。删掉 ${zip} 重下，或换网络——别绕过校验。`,
        )
    }

    // 解压到 bin/<id>，去掉 zip 里的顶层目录
    rmSync(dir, { recursive: true, force: true })
    const extract = spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`,
        ],
        { stdio: "ignore", timeout: 5 * 60 * 1000 },
    )
    if (extract.status !== 0) fail(`解压 ${c.id} 失败`, `手动：Expand-Archive '${zip}' '${dir}'`)

    // zip 内多一层版本目录，把它挪上来
    const nested = path.join(dir, c.dir)
    if (existsSync(nested)) {
        for (const name of readdirSync(nested)) {
            renameSync(path.join(nested, name), path.join(dir, name))
        }
        rmSync(nested, { recursive: true, force: true })
    }
    if (!existsSync(path.join(dir, c.exe))) {
        fail(`${c.id} 解压后找不到 ${c.exe}`, `看看 ${dir} 里实际有什么`)
    }
    return `装了 ${c.id} ${c.version}`
}

// ── 配置 ──────────────────────────────────────────────────────────────────

/** 把仓库里的配置拷到 ~/.shop-obs/conf。相对 rule_files 要与配置文件同目录。 */
function syncConfigs() {
    mkdirSync(CONF, { recursive: true })
    const repo = repoRoot()
    copyFileSync(
        path.join(repo, "deploy/observability/prometheus/prometheus.local.yml"),
        path.join(CONF, "prometheus.local.yml"),
    )
    copyFileSync(
        path.join(repo, "deploy/observability/prometheus/shop-alerts.yml"),
        path.join(CONF, "shop-alerts.yml"),
    )
    copyFileSync(
        path.join(repo, "deploy/observability/alertmanager/alertmanager.yml"),
        path.join(CONF, "alertmanager.yml"),
    )
}

// ── 启停 ──────────────────────────────────────────────────────────────────

function pidFile(c) {
    return path.join(RUN, `${c.id}.pid`)
}

function runningPid(c) {
    try {
        const pid = Number.parseInt(readFileSync(pidFile(c), "utf8").trim(), 10)
        if (!Number.isFinite(pid)) return null
        try {
            process.kill(pid, 0)
            return pid
        } catch {
            return null
        }
    } catch {
        return null
    }
}

/** 停一个组件（按 pid，停了清 pid 文件） */
function stopComponent(c) {
    const pid = runningPid(c)
    if (pid !== null) {
        try {
            process.kill(pid)
        } catch {
            // 已经没了
        }
    }
    rmSync(pidFile(c), { force: true })
}

/**
 * 建齐所有需要的目录。
 *
 * `data/grafana` **必须预先存在**：Grafana 不会自己建它，只会拿它去创建 grafana.db，
 * 目录不存在就直接报错退：
 *   `failed to create SQLite database file ... open ...: The system cannot find the path specified.`
 * （踩过：Prometheus / Alertmanager 自己会建子目录，所以只有 Grafana 挂。）
 */
function ensureDirs() {
    for (const d of [
        BIN,
        CONF,
        DATA,
        LOGS,
        RUN,
        CACHE,
        path.join(DATA, "grafana"),
        path.join(DATA, "grafana", "plugins"),
    ]) {
        mkdirSync(d, { recursive: true })
    }
}

/**
 * 修补 Grafana 13.2.x Windows 压缩包里的 prometheus 插件。
 *
 * 背景：Grafana 13.2 把 Prometheus 数据源改成了独立进程型插件（gpx），注册需要一份
 * `plugin.json`。但 **Windows 独立版压缩包漏装了它**——目录里只有一个 33MB 的
 * `gpx_grafana-prometheus-datasource_windows_amd64.exe`，没有 plugin.json / module.js，
 * 于是 Grafana 认不出这个数据源（报 “plugin prometheus not found”、数据源代理 404），
 * 面板全空。与 grafana#130921 同一类打包问题。
 * 补一份 plugin.json 就好（后端 exe 本身是完整的）。elasticsearch / loki 等都有这份元数据，
 * 只有 prometheus 漏了。
 *
 * 幂等：文件已存在就跳过。每次 obs up 都会调，所以重新解压（升级版本）后会自动补回来。
 */
function ensurePrometheusPluginJson() {
    const dir = path.join(BIN, "grafana", "data", "plugins-bundled", "prometheus")
    if (!existsSync(dir)) return "prometheus 插件目录不在（跳过）"
    const json = path.join(dir, "plugin.json")
    if (existsSync(json)) return "prometheus plugin.json 已存在"
    // executable 字段不含平台后缀：Grafana 会按平台补 _windows_amd64.exe
    writeFileSync(
        json,
        `${JSON.stringify(
            {
                type: "datasource",
                name: "Prometheus",
                id: "prometheus",
                executable: "gpx_grafana-prometheus-datasource",
                category: "metrics",
                info: {
                    description: "Prometheus time-series database and query language",
                    author: { name: "Grafana Labs", url: "https://grafana.com" },
                    keywords: ["prometheus", "datasource", "metrics", "timeseries"],
                    version: "13.2.2",
                    updated: "2026-09-22",
                },
                alerting: true,
                annotations: true,
                metrics: true,
                logs: false,
                backend: true,
                queryOptions: { minInterval: true },
                dependencies: { grafanaDependency: ">=13.0.0-0", plugins: [] },
                buildMode: "production",
            },
            null,
            4,
        )}\n`,
        "utf8",
    )
    return "已补 prometheus plugin.json（Grafana 13.2 Windows 包漏装，修数据源不注册）"
}

/** 启动一个组件：detached + 忽略 stdio，日志落文件。 */
function startComponent(c, args, env) {
    const exe = path.join(BIN, c.id, c.exe)
    const logFd = openSync(path.join(LOGS, `${c.id}.log`), "a")
    const child = spawn(exe, args, {
        detached: true,
        // 必须 windowsHide：Windows 上 detached 会给子进程**新开一个控制台窗口**，
        // 不加这个每次起三个组件就弹三个黑框。而且 detached 子进程会继承父进程的管道，
        // 导致启动命令看似不返回。
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
        cwd: CONF,
        env: { ...process.env, ...env },
    })
    child.unref()
    writeFileSync(pidFile(c), String(child.pid))
}

async function waitReady(c, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- 轮询睡眠必须串行等，不能并行
        if (await isOpen(c.port)) return true
        sleep(500)
    }
    return false
}

// ── dev（前台：三个组件跑在当前终端，Ctrl-C 全停）─────────────────────────

/**
 * 前台模式——看效果就用这个。
 *
 * 与 `up` 的区别只有一个，但很关键：这里**不 detached、不重定向 stdio**。
 * 子进程直接继承当前终端的控制台与输出，于是：
 *   - **不弹任何窗口**（弹窗是 detached 导致的，Windows 会给它分配新控制台）
 *   - 三个组件的日志实时打在你眼前，出错一眼看得见
 *   - Ctrl-C 一次把三个都收掉，不留孤儿进程、不占后台内存
 * 代价：关掉这个终端就全没了（这正是「最干净」的含义）。要常驻再用 up / 计划任务。
 */
async function dev() {
    ensureDirs()
    for (const c of COMPONENTS) console.log(ensureComponent(c))
    console.log(ensurePrometheusPluginJson())
    syncConfigs()

    const [prom, am, graf] = COMPONENTS
    const children = []
    const launch = (c, args, env) => {
        const child = spawn(path.join(BIN, c.id, c.exe), args, {
            // 关键：不设 detached。子进程共用父终端控制台，因此不弹窗。
            stdio: "inherit",
            cwd: CONF,
            env: { ...process.env, ...env },
        })
        child.on("exit", (code) => console.log(`\n[${c.id}] 退出（code ${code}）`))
        children.push(child)
    }

    launch(
        prom,
        [
            "--config.file=prometheus.local.yml",
            `--storage.tsdb.path=${path.join(DATA, "prometheus")}`,
            "--storage.tsdb.retention.time=7d",
            `--web.listen-address=127.0.0.1:${PORTS.prometheus}`,
        ],
        {},
    )
    launch(
        am,
        [
            "--config.file=alertmanager.yml",
            `--storage.path=${path.join(DATA, "alertmanager")}`,
            `--web.listen-address=127.0.0.1:${PORTS.alertmanager}`,
        ],
        {},
    )
    launch(graf, ["server", "--homepath", path.join(BIN, "grafana")], grafanaEnv())

    // 逐个等就绪，然后给出一行「去哪儿看」
    const ready = []
    for (const c of COMPONENTS) {
        // oxlint-disable-next-line no-await-in-loop -- 串行等才能看出是哪个卡住
        if (await waitReady(c, 90_000)) ready.push(c)
    }
    console.log("\n────────────────────────────────────────")
    for (const c of COMPONENTS) {
        console.log(`  ${ready.includes(c) ? "✓" : "✖"} ${c.id.padEnd(12)} :${c.port}`)
    }
    if (ready.includes(graf)) {
        console.log(`\n  看板 → http://localhost:${PORTS.grafana}/dashboards   （admin / shop）`)
    }
    if (!ready.includes(prom)) {
        console.log("  提示：prometheus 没起来，看板会没有数据")
    }
    console.log("  Ctrl-C 停止全部（不留后台进程）\n────────────────────────────────────────\n")

    // 挂着直到 Ctrl-C；退出时把三个都收掉
    const bye = () => {
        console.log("\n正在停止…")
        for (const ch of children) {
            try {
                ch.kill()
            } catch {
                // 已经退了
            }
        }
        process.exit(0)
    }
    process.on("SIGINT", bye)
    process.on("SIGTERM", bye)
    await new Promise(() => {}) // 永不 resolve，等信号
}

// ── up / down / status ─────────────────────────────────────────────────────

function grafanaEnv() {
    return {
        // **不覆盖 GF_PATHS_DATA / GF_PATHS_PLUGINS**。
        // Grafana 13 的内置插件（含 prometheus 数据源）是从 <homepath>/data/plugins-bundled
        // 加载的，而 homepath 由 --homepath 指定。改了 GF_PATHS_DATA 就把这条路径挪走，
        // 结果 prometheus 插件注册不上（报 “plugin prometheus not found”、数据源健康 404）——
        // 踩过。Grafana 自己写 data/grafana.db 到 <homepath>/data，正好和 plugins-bundled 同居。
        GF_PATHS_LOGS: path.join(LOGS, "grafana"),
        // 看板与数据源直接读仓库：改了 JSON 不用重装，Grafana 自己轮询加载
        GF_PATHS_PROVISIONING: path.join(repoRoot(), "deploy/observability/grafana/provisioning"),
        SHOP_OBS_ROOT: repoRoot(),
        SHOP_OBS_PROM_URL: `http://127.0.0.1:${PORTS.prometheus}`,
        GF_SERVER_HTTP_ADDR: "127.0.0.1",
        GF_SERVER_HTTP_PORT: String(PORTS.grafana),
        GF_SECURITY_ADMIN_USER: "admin",
        GF_SECURITY_ADMIN_PASSWORD: "shop",
        GF_USERS_ALLOW_SIGN_UP: "false",
        GF_AUTH_ANONYMOUS_ENABLED: "false",
        GF_ANALYTICS_REPORTING_ENABLED: "false",
        GF_ANALYTICS_CHECK_FOR_UPDATES: "false",
        GF_UNIFIED_ALERTING_ENABLED: "false",
        // 关掉启动时自动下载数据源插件：它会去 grafana.com / storage.googleapis.com 拉，
        // 本机到那边会 TLS handshake timeout（日志里 jaeger 就是这么失败的），
        // 拉下来还会和 plugins-bundled 里的重名（dedupe 警告）并拖慢启动。
        // 我们真正要的 prometheus 已由 ensurePrometheusPluginJson() 就地补好。
        GF_PLUGINS_PREINSTALL_DISABLED: "true",
        GF_LOG_LEVEL: "warn",
    }
}

async function up() {
    ensureDirs()

    for (const c of COMPONENTS) {
        if (runningPid(c) !== null) {
            stopComponent(c) // 重启，保证配置/看板变更生效
        }
    }

    for (const c of COMPONENTS) console.log(ensureComponent(c))
    console.log(ensurePrometheusPluginJson())
    syncConfigs()

    const [prom, am, graf] = COMPONENTS
    startComponent(
        prom,
        [
            "--config.file=prometheus.local.yml",
            `--storage.tsdb.path=${path.join(DATA, "prometheus")}`,
            "--storage.tsdb.retention.time=7d",
            `--web.listen-address=127.0.0.1:${PORTS.prometheus}`,
        ],
        {},
    )
    startComponent(
        am,
        [
            "--config.file=alertmanager.yml",
            `--storage.path=${path.join(DATA, "alertmanager")}`,
            `--web.listen-address=127.0.0.1:${PORTS.alertmanager}`,
        ],
        {},
    )
    startComponent(graf, ["server", "--homepath", path.join(BIN, "grafana")], grafanaEnv())

    const failed = []
    for (const c of COMPONENTS) {
        // oxlint-disable-next-line no-await-in-loop -- 逐个等就绪：串行才看得出是哪个卡住
        if (await waitReady(c)) {
            console.log(`✓ ${c.id} :${c.port} 就绪`)
        } else {
            failed.push(c.id)
            let tail = "(没有日志文件)"
            try {
                tail = readFileSync(path.join(LOGS, `${c.id}.log`), "utf8")
                    .split(/\r?\n/)
                    .slice(-15)
                    .join("\n")
            } catch {
                // 日志还不存在
            }
            console.error(`✖ ${c.id} 60s 内未就绪。日志尾部：\n${tail}`)
        }
    }
    if (failed.length > 0) process.exit(1)

    console.log("可观测性栈已启动（全部在 Windows 本机，无 WSL 参与）：")
    console.log(
        `  看板     → http://localhost:${PORTS.grafana}/dashboards  （admin / shop，仅本机）`,
    )
    console.log(`  Prometheus → http://localhost:${PORTS.prometheus}（已加载 shop-alerts.yml）`)
    console.log(
        `  告警     → http://localhost:${PORTS.alertmanager}（空 receiver，只写日志不发通知）`,
    )
}

function down() {
    for (const c of COMPONENTS) {
        stopComponent(c)
    }
    console.log("✓ 已停 prometheus / alertmanager / grafana")
    console.log("  二进制与配置留在 ~/.shop-obs，再 obs up 直接复用")
}

async function status() {
    console.log("可观测性栈（Windows 本机）：")
    for (const c of COMPONENTS) {
        const pid = runningPid(c)
        const mark = pid === null ? "·" : "✓"
        const how = pid === null ? "未运行" : `pid ${pid}`
        console.log(`  ${mark} ${c.id.padEnd(12)} :${c.port}  ${how}`)
    }
    // 抓取目标：up=1 才是真抓到后端
    const closed = await closedPorts()
    if (closed.length === 0) {
        const r = spawnSync(
            "curl.exe",
            ["-fsS", "-m", "3", `http://127.0.0.1:${PORTS.prometheus}/api/v1/targets?state=active`],
            { encoding: "utf8" },
        )
        const health = [...text(r.stdout).matchAll(/"health":"([a-z]+)"/g)].map((m) => m[1])
        const reachable = health.filter((h) => h === "up").length
        console.log(`抓取目标：${reachable}/${health.length} 可达（down = 后端没起，看板会空）`)
    }
    console.log(`看板：http://localhost:${PORTS.grafana}/dashboards （admin / shop，本机 only）`)
}

if (MODE === "dev") await dev()
else if (MODE === "up") await up()
else if (MODE === "down") down()
else if (MODE === "status") await status()
else fail(`未知模式：${MODE}`, "用法：dev | up | down | status")
