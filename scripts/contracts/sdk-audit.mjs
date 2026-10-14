#!/usr/bin/env node
/**
 * SDK 契约一致性审计脚本（sdk:gen 之后跑一次）：
 * 用生成的 SDK zod schema 对 OpenAPI 契约里每个 object schema 做「全字段为 null」的 roundtrip 校验，
 * 提前发现「契约可空 → 但 SDK 生成强制」这类只有运行时才暴露的问题。
 *
 * 分两类输出：
 *   ERROR：字段在 OpenAPI 里标了 nullable / 不是 required，但 SDK 生成后不接受 null —— 契约与生成不一致，必须修（exit 1）
 *   WARN ：字段在 OpenAPI 里是 required 且非 nullable，但业务上很可能可空（如地址邮编/公司/备注）——
 *          若确实可空请在后端字段加 @Schema(nullable = true) 并重新 sdk:gen；此清单供人扫一眼（不阻断）。
 *
 * 运行：node scripts/contracts/sdk-audit.mjs   （Node 24+，依赖 Node 原生 TS type-stripping 直接 import SDK）
 * 说明：WARN 为启发式提示（响应 schema 必填字段名含可选语义），需人确认；ERROR 为自动闸门，sdk:gen 后应恒为 0。
 *       可空判定必须覆盖四种写法（nullable / type:"null" / type 数组含 null / anyOf 里的 null 分支）——
 *       只认 `nullable` 会让「$ref + type:"null"」那类字段整个溜过去，而那正是最会出事的形态。
 */

import { readFile } from "node:fs/promises"
import { out as makeOut } from "../lib/out.mjs"

const ROOT = new URL("../../", import.meta.url)
const OPENAPI = new URL("openapi/api-docs.json", ROOT)
const ZOD_URL = new URL("../../packages/api/src/sdk/zod.gen.ts", import.meta.url)
const o = makeOut("sdk:audit")

const apiDoc = JSON.parse(await readFile(OPENAPI, "utf8"))
const schemas = apiDoc.components?.schemas ?? {}
const zod = await import(ZOD_URL.href)

/** 读某 schema 的字段可空性信息；非 object schema 返回 undefined（跳过） */
function propsOf(schema) {
    const isObject = schema.type === "object" || (schema.properties && !schema.allOf)
    if (!isObject) return undefined
    const required = new Set(schema.required ?? [])
    const properties = schema.properties ?? {}
    return {
        props: Object.entries(properties).map(([name, p]) => ({
            name,
            nullable: isNullable(p),
            required: required.has(name),
        })),
    }
}

/**
 * 该属性在 OpenAPI 里是否标了可空。四种等价写法都要认，漏掉一种就会出现
 * 「契约说可空、SDK 说非空」却审计不到的盲区：
 *   - `nullable: true`            OpenAPI 3.0 遗留写法
 *   - `type: "null"`              3.1 单类型（springdoc 对 $ref 属性的畸形输出就长这样）
 *   - `type: ["integer","null"]`  3.1 类型数组
 *   - `anyOf: [{…}, {type:"null"}]` 3.1 规范写法（infra.web.OpenApiConfig 正把上面那种改写成它）
 */
function isNullable(prop) {
    if (prop.nullable === true || prop.type === "null") return true
    if (Array.isArray(prop.type) && prop.type.includes("null")) return true
    const branches = [...(prop.anyOf ?? []), ...(prop.oneOf ?? [])]
    return branches.some((branch) => branch?.type === "null")
}

const errors = []
const warns = []

/** 字段名带可选语义（邮编/公司/备注/图片/链接等）的响应字段，更可能实际可空而漏标 @Schema(nullable = true) */
const HINT =
    /postal|company|note|remark|memo|alias|subtitle|avatar|logo|image|url|link|desc|comment|reason|key|sort|target|icon|detail|attr|spec|param|sub|preview|banner/i

for (const [key, schema] of Object.entries(schemas)) {
    const info = propsOf(schema)
    if (!info) continue
    const zodSchema = zod[`z${key}`]
    if (typeof zodSchema?.parse !== "function") continue // SDK 未生成该 schema（如仅内部引用），跳过

    // 全字段置 null 构造 fixture：null 恰好能区分「接受 null（可空/可选）」与「要求 string（必填）」
    // oxlint-disable-next-line no-null -- 审计脚本的手法本身就是拿 null 区分契约可空性，必须保留
    const fixture = Object.fromEntries(info.props.map((p) => [p.name, null]))
    let issues = []
    try {
        zodSchema.parse(fixture)
    } catch (error) {
        issues = error.issues ?? []
    }
    // 凡 parse(null) 报错的字段 = SDK 断言非空（强制 string/enum…）
    const rejectedNull = new Set(issues.map((i) => String(i.path?.[0] ?? i.code)))
    const isResponse = key.endsWith("Response")

    for (const p of info.props) {
        if (!rejectedNull.has(p.name)) continue
        if (p.nullable) {
            // 明确标了 nullable 却仍拒绝 null：契约与 SDK 生成不一致（自动闸门，必须修）
            errors.push(`${key}.${p.name}  标了 nullable 但 SDK 生成后拒绝 null`)
        } else if (isResponse && p.required && HINT.test(p.name)) {
            // 响应 schema 的「required 非空」字段，字段名带可选语义 → 疑似漏标可空（启发式，供人确认）
            warns.push(`${key}.${p.name}`)
        }
    }
}

o.raw("── SDK 契约一致性审计 ───────────────────────────────")
if (errors.length > 0) {
    o.err(`${errors.length} 处「标了可空但 SDK 仍拒绝 null」= 契约与生成不一致：`)
    errors.forEach((e) => o.rawErr(`   ${e}`))
} else {
    o.ok("已标 nullable / 非 required 的字段，SDK 生成均接受 null")
}

if (warns.length > 0) {
    o.warn(
        `${warns.length} 个「required 非空」字段（若业务可空请标 @Schema(nullable = true)，确认无需调整则无视）：`,
    )
    warns.forEach((w) => o.rawErr(`   ${w}`))
}

if (errors.length > 0) {
    process.exit(1)
}
