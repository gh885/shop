import { execFileSync } from "node:child_process"

import { DB } from "./env"

const UUID = /^[0-9a-f-]{36}$/

/**
 * 给商家授一个叶子类目。
 *
 * 为什么绕一次库：类目授权没有任何 HTTP 入口（governance 只在发布时读
 * `governance.category_grant`，管理端也没有授权端点），后端自己的测试也是直接 INSERT。
 * 授权表除了这一条没有任何业务读依赖 runId，输入两侧都是服务端发的 UUID。
 */
export function grantCategory(merchantId: string, categoryId: string): void {
    for (const value of [merchantId, categoryId]) {
        if (!UUID.test(value)) throw new Error(`类目授权的入参不是 UUID：${value}`)
    }
    const sql =
        `INSERT INTO governance.category_grant (merchant_id, category_id) ` +
        `VALUES ('${merchantId}', '${categoryId}') ON CONFLICT DO NOTHING`
    /** psql 的参数只有一份：两次调用差的只是外面那层壳（Windows 走 WSL），不该各写一遍 */
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
    if (out.trim() !== "INSERT 0 1") {
        throw new Error(`类目授权写入失败（psql 输出：${JSON.stringify(out)}）`)
    }
}
