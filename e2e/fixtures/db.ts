import { execFileSync } from "node:child_process"
import { DB } from "./env"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 运单号是本目录生成的标识（E2E + 轮次），只允许这点字符进 SQL */
const SAFE_NO = /^[A-Za-z0-9-]+$/

/**
 * 按运单号反查包裹 id。
 *
 * 为什么绕一次库：`POST /admin/logistics/shipments/{id}/tracking-nodes` 要的是包裹 UUID，
 * 而今天没有任何读接口给得出它——买家轨迹 `GET /orders/{id}/tracking` 的 shipments 只有
 * 运单号/状态/节点，卖家侧也没有包裹列表。管理端补录轨迹那条 UI 还没建（apps/admin 未接这个端点），
 * 等它建起来必然要先有一个「按订单列包裹」的读接口，届时把这里换成接口调用。
 */
export function shipmentIdByTrackingNo(trackingNo: string): string {
    if (!SAFE_NO.test(trackingNo))
        throw new Error(`运单号 ${trackingNo} 含非预期字符，拒绝入库查询`)

    const sql = `select id from logistics.shipments where tracking_no = '${trackingNo}'`
    /** psql 的参数只有一份：两次调用差的只是外面那层壳，不该各写一遍各自的 flag 列表 */
    const psqlArgs = [
        "-X",
        "-t",
        "-A",
        "-h",
        DB.host,
        "-p",
        String(DB.port),
        "-U",
        DB.user,
        "-d",
        DB.name,
        "-c",
        sql,
    ]
    const out =
        process.platform === "win32"
            ? execFileSync(
                  "wsl.exe",
                  [
                      "-d",
                      DB.distro,
                      "--",
                      "bash",
                      "-lc",
                      `PGPASSWORD=${DB.password} psql ${psqlArgs.map((arg) => `"${arg}"`).join(" ")}`,
                  ],
                  { encoding: "utf8" },
              )
            : execFileSync("psql", psqlArgs, {
                  encoding: "utf8",
                  env: { ...process.env, PGPASSWORD: DB.password },
              })

    const ids = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => UUID.test(line))
    if (ids.length !== 1) {
        throw new Error(
            `运单号 ${trackingNo} 反查到 ${ids.length} 个包裹，期望 1 个（原始输出：${JSON.stringify(out)}）`,
        )
    }
    return ids[0]
}
