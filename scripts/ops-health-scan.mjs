#!/usr/bin/env node
/**
 * 运营数据健康扫描：只读 SQL，输出可定位对象 ID，不自动修复。
 * 用法：SHOP_DB_NAME=shop pnpm health:scan
 */
import { execFileSync } from "node:child_process"

const db = {
    host: process.env.SHOP_DB_HOST ?? "127.0.0.1",
    port: process.env.SHOP_DB_PORT ?? "15432",
    user: process.env.SHOP_DB_USER ?? "shop",
    password: process.env.SHOP_DB_PASSWORD ?? "shop_dev",
    name: process.env.SHOP_DB_NAME ?? "shop",
    distro: process.env.SHOP_WSL_DISTRO ?? "Ubuntu",
}

const checks = [
    {
        name: "孤立用户券",
        sql: `SELECT c.id::text FROM coupon.user_coupons c
          LEFT JOIN account.users u ON u.id = c.user_id
          LEFT JOIN shop.shops s ON s.id = c.shop_id
          WHERE u.id IS NULL OR s.id IS NULL LIMIT 100`,
    },
    {
        name: "锁定超时用户券",
        sql: `SELECT id::text FROM coupon.user_coupons
          WHERE status = 'LOCKED' AND locked_at < now() - interval '30 minutes' LIMIT 100`,
    },
    {
        name: "超时待付款订单",
        sql: `SELECT id::text FROM orders.orders
          WHERE status = 'PENDING_PAYMENT' AND created_at < now() - interval '30 minutes' LIMIT 100`,
    },
    {
        // 库存自 V19 起住在 inventory.sku_stock（product.skus 上没有 stock 列），可用量 = 总量 − 冻结量；
        // 没建库存行的 SKU 视同无货（正常链路不会出现，出现即是要查的脏数据）
        name: "在架但无可售库存的商品",
        sql: `SELECT p.id::text FROM product.products p
          WHERE p.status = 'PUBLISHED'
            AND NOT EXISTS (
              SELECT 1 FROM product.skus s
              LEFT JOIN inventory.sku_stock st ON st.sku_id = s.id
              WHERE s.product_id = p.id
                AND s.status = 'ON_SALE'
                AND COALESCE(st.stock, 0) - COALESCE(st.frozen_stock, 0) > 0
            ) LIMIT 100`,
    },
]

/**
 * 本机 PG 跑在 WSL2 里，Windows 侧没有 psql：进 WSL 执行（与 e2e/fixtures/db.ts 同一口径）。
 * 参数只写一份，两个平台差的只是外面那层壳。
 */
function query(sql) {
    const args = [
        "-X",
        "-A",
        "-t",
        "-q",
        "-h",
        db.host,
        "-p",
        db.port,
        "-U",
        db.user,
        "-d",
        db.name,
        "-c",
        sql,
    ]
    if (process.platform !== "win32") {
        return execFileSync("psql", args, {
            env: { ...process.env, PGPASSWORD: db.password },
            encoding: "utf8",
        }).trim()
    }
    return execFileSync(
        "wsl.exe",
        [
            "-d",
            db.distro,
            "--",
            "bash",
            "-lc",
            `PGPASSWORD=${db.password} psql ${args.map((arg) => `"${arg}"`).join(" ")}`,
        ],
        { encoding: "utf8" },
    ).trim()
}

let failed = false
for (const check of checks) {
    try {
        const ids = query(check.sql)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        console.log(
            `${ids.length > 0 ? "WARN" : "OK"}  ${check.name}${ids.length > 0 ? `: ${ids.join(", ")}` : ""}`,
        )
        failed ||= ids.length > 0
    } catch (error) {
        failed = true
        console.error(`ERROR ${check.name}: ${error.message}`)
    }
}

process.exitCode = failed ? 1 : 0
