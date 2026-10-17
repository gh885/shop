#!/usr/bin/env node
/**
 * 数据面「在不在位」这一层的单一真相源：本地探活端口对、探活实现、数据面默认偏好。
 *
 * 三个消费者共用它——`ensure-datastore.mjs`（起/停/守）、`with-datastore.mjs`（后端测试前的探针）、
 * `db-status.mjs`（状态总览）。端口默认值只在这里写一遍：改了这里没同步到探针，探针会把「其实在位」
 * 误报成「库没起」。远端端口 / SSH 主机 / WSL 保活串只有 ensure 用，刻意不抽进来（不为不存在的使用者抽象）。
 *
 * 全部是函数、调用时才读 process.env：若做成模块顶层常量，import 提升会让它跑在 `loadDevEnv()` 之前，
 * 读到还没加载 `apps/server/.env` 的空 env。
 */
import { connect } from "node:net"

/** 本地 PG / Redis 端口：remote 模式下这是隧道在本地绑的端口，全仓库 `SHOP_DB_*` 变量族的默认口径 */
export function datastoreTargets() {
    return [
        { name: "PostgreSQL", port: Number(process.env.SHOP_DB_PORT ?? 15432) },
        { name: "Redis", port: Number(process.env.SHOP_REDIS_PORT ?? 6379) },
    ]
}

/** 数据面偏好，仓库默认 remote（云上）。非法值不在这里校验——只有 ensure 会因配置错拒绝启动 */
export function datastoreMode() {
    return process.env.SHOP_DATASTORE ?? "remote"
}

/**
 * 探一个端口：能连上 = true；拒连 / 超时 = false（两种失败对调用方没区别，都不叫「在位」）。
 * @param {number} timeoutMs 由各调用方按场景给——探针保守、快速轮询各不同，故不在此设默认。
 */
export function isOpen(port, timeoutMs) {
    return new Promise((resolve) => {
        const socket = connect({ host: "127.0.0.1", port })
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
