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

import { connect } from "node:net"

/** 与 scripts/ensure-datastore.mjs 的两个端口保持一致 */
const SERVICES = [
    { name: "PostgreSQL", port: Number(process.env.SHOP_DB_PORT ?? 15432) },
    { name: "Redis", port: Number(process.env.SHOP_REDIS_PORT ?? 6379) },
]

const CONNECT_TIMEOUT_MS = 1500

/**
 * 探一个端口：有人接 = true；拒连 / 超时 = false。
 * 两种失败对本脚本没有区别（都叫「不在位」），所以不把 errno 往外传。
 */
function probe(port) {
    return new Promise((resolve) => {
        const socket = connect(port, "127.0.0.1")
        const finish = (up) => {
            socket.destroy()
            resolve(up)
        }
        socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false))
        socket.once("connect", () => finish(true))
        socket.once("error", () => finish(false))
    })
}

const probes = await Promise.all(SERVICES.map((svc) => probe(svc.port)))
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
        "  修：pnpm db:up        # 从 WSL 拉起 PG + Redis（首次约 30~60s）",
        "      pnpm dev:server   # 或者让开发服务器带着数据面跑",
        "",
        "  确实想跳过这个探针：SHOP_SKIP_DATASTORE_CHECK=1 <命令>",
        "",
    ].join("\n"),
)
process.exit(1)
