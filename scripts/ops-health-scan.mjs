#!/usr/bin/env node
/**
 * 运营数据健康扫描：只读 SQL，输出可定位对象 ID，不自动修复。
 * 用法：SHOP_DB_NAME=shop pnpm health:scan
 */
import { execFileSync } from "node:child_process"

const db = {
    host: process.env.SHOP_DB_HOST ?? "127.0.0.1",
    port: process.env.SHOP_DB_PORT ?? "5432",
    user: process.env.SHOP_DB_USER ?? "shop",
    password: process.env.SHOP_DB_PASSWORD ?? "shop_dev",
    name: process.env.SHOP_DB_NAME ?? "shop",
}

const checks = [
    {
        name: "孤立用户券",
        sql: `SELECT id::text FROM coupon.user_coupons c
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
        name: "无在售 SKU 的上架商品",
        sql: `SELECT p.id::text FROM product.products p
          WHERE p.status = 'PUBLISHED'
            AND NOT EXISTS (
              SELECT 1 FROM product.skus s
              WHERE s.product_id = p.id AND s.status = 'ON_SALE' AND s.stock > 0
            ) LIMIT 100`,
    },
]

function query(sql) {
    const env = { ...process.env, PGPASSWORD: db.password }
    return execFileSync(
        "psql",
        [
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
        ],
        { env, encoding: "utf8" },
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
