#!/usr/bin/env node
/**
 * 跑后端测试（`mvn test`）之前先确认数据面在位 —— **不让「库没起」伪装成测试失败**。
 *
 * 为什么需要探针、库不在时红成什么样、怎么修：都写在下面的输出里（那份输出才是操作者会读的）；
 * WSL 侧 VM 被回收的机制与实测结论见 scripts/ensure-datastore.mjs 的头注释。
 *
 * 本脚本只探不跑：两个端口都在 → exit 0（调用方用 `&&` 接真命令）；
 * 任一不在 → 打印修法并 exit 1，真命令不会被执行。
 * **不自动拉起**：拉起要 30~60s，而 IDE 里通常已有 `pnpm dev:server` / `pnpm db:up` 在管，
 * 探针再起一份容易打架。要拉起就显式跑 `pnpm db:up`。
 *
 * 运行：node scripts/with-datastore.mjs       （正常路径只花两个 TCP 连接，毫秒级）
 *  例：  "test:server": "node scripts/with-datastore.mjs && mvn -f apps/server/pom.xml test"
 *
 * 确实想跳过探针（比如故意要验证「库没起」时的失败形态）：SHOP_SKIP_DATASTORE_CHECK=1
 */

import { loadDevEnv } from "./dotenv.mjs"
import { datastoreTargets, datastoreMode, isOpen } from "./datastore.mjs"

loadDevEnv()

// 本地端口对来自 datastore.mjs 单一真相源（与 ensure / db-status 同一份，不在这手抄）
const SERVICES = datastoreTargets()
// 数据面在哪台机器，修法那句就得跟着说哪台——否则把人指向一条起错东西的命令
const REMOTE = datastoreMode() === "remote"
const FIX = REMOTE
    ? "起 ssh 隧道（数据面在云上，见 apps/server/.env）"
    : "从 WSL 拉起 PG + Redis（首次约 30~60s）"

const CONNECT_TIMEOUT_MS = 1500

// 探活实现来自 datastore.mjs；超时 1500ms 是探针的保守值（区别于 ensure 快速轮询的默认）
const probes = await Promise.all(SERVICES.map((svc) => isOpen(svc.port, CONNECT_TIMEOUT_MS)))
const down = SERVICES.filter((_, i) => !probes[i])

if (down.length === 0) process.exit(0)

if (process.env.SHOP_SKIP_DATASTORE_CHECK === "1") process.exit(0)

process.stderr.write(
    [
        `✖ 数据面不在位：${down.map((s) => `${s.name}(:${s.port})`).join("、")} 连不上，后端测试已跳过（没跑）。`,
        "",
        "  后端接口契约测试（@SpringBootTest）要连专用库 shop_test。库不在时它们整类红，",
        "  Spring 的 failure threshold 还会把后面几百个用例一起带红 —— 那不是代码坏了，是库没起。",
        "",
        `  修：pnpm db:up        # ${FIX}`,
        "      pnpm dev:server   # 或者让开发服务器带着数据面跑",
        "",
        "  确实想跳过这个探针：SHOP_SKIP_DATASTORE_CHECK=1 <命令>",
        "",
    ].join("\n"),
)
process.exit(1)
