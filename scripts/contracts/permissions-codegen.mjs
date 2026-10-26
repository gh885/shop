/**
 * permissions codegen：从 `contracts/permissions.yaml` 生成前端权限码常量。
 *
 * 唯一真相是 yaml。前端不该手写权限字符串——一个字母的差别不会编译报错，只会让那项权限
 * 永远为假（菜单不出现）或永远为真（按钮出现了但后端 403）。
 *
 * 生成物 `packages/common/src/contract/permission-codes.ts` 的头部写着"不要手改"，
 * 本脚本是那句话唯一的兑现方式。
 *
 * 边界（有意不做）：
 * - **不生成后端 Java 枚举**。后端 `Permission` 带注释、带分组、带"为什么和相邻点分开"的论证，
 *   生成器产出不了这些。后端那份由 `PermissionVocabularyTest` 与本 yaml 对拍保证一致。
 * - **不校验岗位授予**。`granted` 列是人读的说明，库里 `staff.role_permission` 才是事实；
 *   两边对拍会变成"文档驱动授权"，而授权该由迁移显式写。
 *
 * `reserved: true` 的条目**不生成**：库里没有、代码里没有、后端枚举里也没有。
 * 生成它等于给前端一个永远为假的常量。
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseDocument } from "yaml"
import { z } from "zod"

import { out } from "../lib/out.mjs"

const ROOT = resolve(import.meta.dirname, "..", "..")
const SOURCE = resolve(ROOT, "contracts", "permissions.yaml")
const TARGET = resolve(ROOT, "packages", "common", "src", "contract", "permission-codes.ts")

const CHECK = process.argv.includes("--check")

const entry = z.strictObject({
    /** 只有两个域。新增域要同时改库里的 domain 列约束、后端校验、这里的 DOMAIN_SECTIONS */
    domain: z.enum(["admin", "seller"]),
    /** 权限码只有一种形态：大写下划线。出现冒号就说明有人在写老形态 */
    code: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/, "权限码必须是大写下划线（老形态 order:read 已废弃）"),
    doc: z.string(),
    granted: z.array(z.string()).optional(),
    reserved: z.literal(true).optional(),
})

const schema = z.array(entry)

/** 域 → 前端分组注释。两个域是硬边界（见 yaml 头部），这里不做兜底 */
const DOMAIN_SECTIONS = {
    admin: { comment: "admin 域（平台员工岗位码）" },
    seller: { comment: "seller 域（店主可授予子账号）" },
}

async function readEntries() {
    const doc = parseDocument(await readFile(SOURCE, "utf8"))
    if (doc.errors.length > 0) {
        throw new Error(`permissions.yaml 解析失败: ${doc.errors.map((e) => e.message).join("; ")}`)
    }
    const parsed = schema.safeParse(doc.toJSON())
    if (!parsed.success) {
        throw new Error(
            `permissions.yaml 结构不合法: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        )
    }
    return parsed.data
}

/** 一个条目渲染成一个常量块：JSDoc 取 doc，值等于名字 */
function renderConstant(item) {
    const doc = item.doc
        .replaceAll("*/", "*\\/")
        .split("\n")
        .map((line) => `     * ${line}`.trimEnd())
        .join("\n")
    const granted = item.granted?.length
        ? `\n     *\n     * <p>授予：${item.granted.join(" / ")}`
        : ""
    return `    /**\n${doc}${granted}\n     */\n    ${item.code}: "${item.code}",`
}

function render(entries) {
    const active = entries.filter((item) => !item.reserved)
    const reserved = entries.filter((item) => item.reserved)

    const byDomain = new Map()
    for (const item of active) {
        const list = byDomain.get(item.domain) ?? []
        list.push(item)
        byDomain.set(item.domain, list)
    }

    const duplicates = active
        .map((item) => item.code)
        .filter((code, index, all) => all.indexOf(code) !== index)
    if (duplicates.length > 0) {
        throw new Error(`permissions.yaml 里有重复的 code: ${[...new Set(duplicates)].join(", ")}`)
    }

    const blocks = [...byDomain.entries()].map(([domain, items]) => {
        const header = `    // —— ${DOMAIN_SECTIONS[domain].comment} ——`
        return [header, ...items.map(renderConstant)].join("\n")
    })

    return `/**
 * 权限码（前后端共同语言）前端侧唯一 owner：<b>本文件由 \`scripts/contracts/permissions-codegen.mjs\` 从
 * \`contracts/permissions.yaml\` 生成，不要手改。</b>跑 \`pnpm permissions:gen\` 重生成，
 * \`pnpm permissions:drift\` 校验生成物与 yaml 一致（pre-push 门禁）。
 *
 * 值等于名字，不许改名（改名 = 契约破坏）。分 admin（平台员工岗位码）/ seller（店主可授予子账号的白名单）两域，
 * 收在同一处，是因为"这个字符串是什么意思"只有一个答案——各 app 自写字符串正是这条要防的。
 *
 * 后端那份（\`infra.security.Permission\` 枚举）不生成：它带注释和分组论证，生成器产出不了。
 * 两份相等由后端 \`PermissionVocabularyTest\` 与本 yaml 三方对拍保证。
 *
 * **这里没有的码就是库里没有的码。** \`reserved: true\` 的条目（${reserved.map((item) => item.code).join(" / ") || "无"}）
 * 只活在文档里，不生成——一个永远为假的常量会让"这个人有权限吗"多出第三种答案。
 */
export const PermissionCodes = {
${blocks.join("\n\n")}
} as const

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes]
`
}

const entries = await readEntries()
const generated = render(entries)

if (CHECK) {
    const current = await readFile(TARGET, "utf8").catch(() => null)
    if (current !== generated) {
        out("permissions:drift").err(
            "permission-codes.ts 与 contracts/permissions.yaml 不一致，跑 `pnpm permissions:gen` 重生成",
        )
        process.exit(1)
    }
    out("permissions:drift").ok("permission-codes.ts 与 permissions.yaml 一致")
} else {
    await writeFile(TARGET, generated, "utf8")
    out("permissions:gen").ok(
        `生成 ${entries.filter((item) => !item.reserved).length} 个权限码（跳过 ${entries.length - entries.filter((item) => !item.reserved).length} 个 reserved）`,
    )
}
