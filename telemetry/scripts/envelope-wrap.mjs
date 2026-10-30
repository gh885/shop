#!/usr/bin/env node
// 把一份 item payload 包成合法 envelope 并打到 stdout，用于手工 curl 与校验器测试。
//
// 存在的唯一理由：envelope 的 length 是**字节数**，手算必错（中文/emoji 一个字多字节），
// 而按字符数算出来的 envelope 在 relay 那里会以"长度越界"被拒——排查半天最后发现是
// 自己手算错了。所以让脚本算。
import { readFileSync } from "node:fs"

const [, , file, kind = "event"] = process.argv
if (!file) {
    console.error("用法: node telemetry/scripts/envelope-wrap.mjs <payload.json> [kind]")
    process.exit(2)
}

const payload = readFileSync(file, "utf8").trimEnd()
const event = JSON.parse(payload)
const eventId = event.event_id ?? "0".repeat(32)
const dsn = process.env.TELEMETRY_DSN ?? "http://dev-public-key@localhost:8090/1"

const header = JSON.stringify({ event_id: eventId, dsn, sent_at: new Date().toISOString() })
const itemHeader = JSON.stringify({ type: kind, length: Buffer.byteLength(payload, "utf8") })

process.stdout.write(`${header}\n${itemHeader}\n${payload}\n`)
