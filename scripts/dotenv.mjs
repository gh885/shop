#!/usr/bin/env node
/**
 * dev 数据面配置的唯一本地来源：`apps/server/.env`（gitignored，机器专属）。
 *
 * Spring 靠 application.yml 的 `config.import` 读它；node / TS 侧只认 process.env，所以每个数据面
 * 消费者都得自己接一次 —— 接法收在这里，不在各处抄第二份。里面住的是口令（SHOP_DB_PASSWORD /
 * SHOP_REDIS_PASSWORD）和数据面偏好（SHOP_DATASTORE），三者都是「别人 clone 下来不该跟着走」的东西。
 *
 * 语义：只补 process.env 里尚未设置的键，所以命令行前缀永远压得过文件。
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** 相对本文件而不是 cwd：脚本从仓库根、从 IDE、从任意工作目录跑，指向的都该是同一个文件 */
export const DEV_ENV_FILE = fileURLToPath(new URL("../apps/server/.env", import.meta.url))

/**
 * 把 .env 里尚未设置的键补进 process.env。
 *
 * @param {string} [file]
 * @returns {string[]} 本次由文件补进来的键名 —— 调用方拿它说明「这个值是谁给的」
 */
export function loadDevEnv(file = DEV_ENV_FILE) {
    let text
    try {
        text = readFileSync(file, "utf8")
    } catch {
        // 没有 .env（CI / 全新克隆）：调用方落到各自的硬编码默认值，这不是错误
        return []
    }
    const filled = []
    for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
        if (!m) continue
        const [, key, raw] = m
        if (raw.startsWith("#")) continue
        if (process.env[key] !== undefined) continue
        process.env[key] = raw.trim().replaceAll(/^["']|["']$/g, "")
        filled.push(key)
    }
    return filled
}
