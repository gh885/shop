/**
 * 权限码 codegen —— `contracts/permissions.yaml` 是唯一真相源，产出两份词表常量：
 *
 * - `apps/server/src/main/java/com/shop/platform/common/Permissions.java`
 * - `packages/common/src/contract/permission-codes.ts`
 *
 * 照 `scripts/error-codes-codegen.mjs` 的三条规矩来：
 * 1. **先收齐、全校验，再一次性落盘**——半截生成物比没有生成物更糟；
 * 2. `--check` 是门禁本体，跑在 pre-push 与 CI，不一致非零退出并指出差在哪一条码；
 * 3. 生成物不许是「手改后再也没人重生成」的孤儿，所以覆盖注册表没写全时**拒绝写入**。
 *
 * 与错误码那份的差别只有两点：权限码值恒等于名（没有 status 列），且注册表里的 `reserved` 码只登记词表、
 * 不产出常量（文档占位码：无 Java 常量、无挂点）。所以 `--write` 渲染的是「非 reserved」那批，
 * 顺序 = 注册表数组顺序 = 文档表顺序。
 *
 * `--check` 按**语义**比而不是按字节比：`spotless`（Google Java Format）会重排 javadoc 的换行，
 * 按字节比必然假红。这里从目标文件里抽出「常量名 + 它的文档注释」，与注册表渲染出的期望值做
 * 空白归一后的相等判断。格式归 spotless 管，内容归这里管。
 *
 * 用法：
 *   node scripts/permissions-codegen.mjs --preview     # 写到系统临时目录，看产物长什么样
 *   node scripts/permissions-codegen.mjs --audit       # 迁移工作单：目标文件里有、注册表里还没登记的码
 *   node scripts/permissions-codegen.mjs --check       # 门禁：不一致即红（退出 1）
 *   node scripts/permissions-codegen.mjs --write       # 落盘（要求注册表已覆盖目标里既有码）
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

import YAML from "yaml"

const ROOT = resolve(import.meta.dirname, "..")
const REGISTRY = join(ROOT, "contracts/permissions.yaml")
const JAVA_TARGET = join(
    ROOT,
    "apps/server/src/main/java/com/shop/platform/common/Permissions.java",
)
const TS_TARGET = join(ROOT, "packages/common/src/contract/permission-codes.ts")
/** 预览落在系统临时目录：仓库里不留生成物，省得加 ignore，也不会被 vp check / fallow 扫到 */
const PREVIEW_DIR = join(tmpdir(), "shop-permissions-preview")

const CODE_SHAPE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/

const args = new Set(process.argv.slice(2))
const MODE = args.has("--write")
    ? "write"
    : args.has("--check")
      ? "check"
      : args.has("--audit")
        ? "audit"
        : "preview"

/** 注册表 → 一份 Java 的期望内容（reserved 码不入常量、不入 all()） */
function renderJava(cards) {
    const live = cards.filter((c) => !c.reserved)
    const lines = [
        "package com.shop.platform.common;",
        "",
        "import java.util.List;",
        "",
        "/**",
        " * 权限码契约（前后端共同语言）：全后端唯一的码定义处，注解码位只引用这里的常量，不再各抄一遍字面量。",
        " *",
        " * <p><b>本文件由 {@code node scripts/permissions-codegen.mjs} 从 {@code contracts/permissions.yaml}",
        " * 生成，不要手改</b>——手改的那一次会在下一个人跑 {@code pnpm permissions:gen} 时静默消失。",
        " * 加一个码或改一句说明都改那份注册表，顺序 = 数组顺序 = 文档表顺序；{@code --check} 把生成物与注册表",
        " * 核回来（按语义比，不按字节：排版归 spotless 管）。",
        " *",
        " * <p>规则：SCREAMING_SNAKE_CASE；值恒等于名；只增不改名不删除（改名 = 契约破坏）。",
        " * 放 common 是因为 shop/account/cms/product 多个模块的 controller 都要引用，放任何单模块都会制造跨模块依赖。",
        " *",
        " * <p>这份表只管词表。谁授予某码 = {@code StaffRole} + {@code SellerGrants}、谁消费某码 = {@code @RequirePermission}",
        " * 扫描，两件事的真相不住这里，由 {@code PermissionVocabularyTest} 在运行时求出并核文档表",
        " * （{@code docs/conventions/permission-codes.md}，那张表是这三处——注册表 + 两份扫描——的人读镜像）。",
        " */",
        "public final class Permissions {",
        "",
    ]
    let previousDomain = null
    for (const card of live) {
        if (card.domain !== previousDomain) {
            lines.push(`    // —— ${card.domain} ——`, "")
            previousDomain = card.domain
        }
        lines.push(...javaDoc(card))
        lines.push(`    public static final String ${card.code} = "${card.code}";`, "")
    }
    lines.push(...allJavadoc())
    lines.push("    public static List<String> all() {", "        return List.of(")
    live.forEach((card, index) => {
        const comma = index === live.length - 1 ? "" : ","
        lines.push(`                ${card.code}${comma}`)
    })
    lines.push("        );", "    }", "", "    private Permissions() {}", "}")
    return `${lines.join("\n")}\n`
}

/** 一条码只许一段 javadoc（两段并存时只有最后那段算 javadoc，前一段静默退成普通注释） */
function javaDoc(card) {
    return ["    /**", `     * ${card.doc}`, "     */"]
}

function allJavadoc() {
    return [
        "    /**",
        "     * 全量权限码（注册表 / 文档表顺序，不含 reserved 占位码）。SUPER_ADMIN 在 me 出参展开成这份清单给前端；",
        "     * 判权内部仍用通配符，两处新增码要同步——这条同步现在由 codegen 与门禁保证，不再由注释管。",
        "     */",
    ]
}

function renderTs(cards) {
    const live = cards.filter((c) => !c.reserved)
    const lines = [
        "/**",
        " * 权限码（前后端共同语言）前端侧唯一 owner：<b>本文件由 `scripts/permissions-codegen.mjs` 从",
        " * `contracts/permissions.yaml` 生成，不要手改。</b>与后端 `common.Permissions`（Java 那份）逐常量对应，",
        " * 两边相等由生成保证；「注册表 ⇄ 岗位授予 ⇄ 端点消费」由后端 `PermissionVocabularyTest` 核对。",
        " *",
        " * 值等于名字，不许改名（改名 = 契约破坏）。分 admin（平台员工岗位码）/ seller（店主可授予子账号的白名单）两域，",
        " * 收在同一处，是因为「这个字符串是什么意思」只有一个答案——各 app 自写字符串正是这条要防的。",
        " * 细则与文档表镜像见 docs/conventions/permission-codes.md。",
        " */",
        "export const PermissionCodes = {",
    ]
    let previousDomain = null
    for (const card of live) {
        if (card.domain !== previousDomain) {
            if (previousDomain !== null) lines.push("")
            lines.push(`    // ${card.domain}`)
            previousDomain = card.domain
        }
        lines.push("    /**", `     * ${card.doc}`, "     */", `    ${card.code}: "${card.code}",`)
    }
    lines.push("} as const", "")
    return lines.join("\n")
}

function validate(cards) {
    const problems = []
    const seen = new Set()
    for (const [index, card] of cards.entries()) {
        const at = `#${index + 1}${card.code ? ` ${card.code}` : ""}`
        if (typeof card.code !== "string" || !CODE_SHAPE.test(card.code)) {
            problems.push(`${at}: code 不是 SCREAMING_SNAKE_CASE（${JSON.stringify(card.code)}）`)
        }
        if (seen.has(card.code)) problems.push(`${at}: 码重复登记`)
        seen.add(card.code)
        for (const field of ["domain", "doc"]) {
            if (typeof card[field] !== "string" || card[field].trim() === "") {
                problems.push(`${at}: ${field} 必填`)
            }
        }
    }
    return problems
}

/** 从已有 Java / TS 里抽出「码 → 文档」，供 --audit 与 --check 用 */
function extractJava(text) {
    const out = new Map()
    const pattern =
        /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?public static final String ([A-Z0-9_]+) = "([A-Z0-9_]+)";/g
    for (const match of text.matchAll(pattern)) {
        out.set(match[2], { doc: normalizeDoc(match[1] ?? ""), value: match[3] })
    }
    return out
}

function extractTs(text) {
    const out = new Map()
    const pattern = /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?([A-Z0-9_]+): "([A-Z0-9_]+)"/g
    for (const match of text.matchAll(pattern)) {
        out.set(match[2], { doc: normalizeDoc(match[1] ?? ""), value: match[3] })
    }
    return out
}

const normalizeDoc = (raw) =>
    raw
        .replace(/^\s*\*?\s?/gm, "")
        .replace(/\s+/g, " ")
        .trim()

function readIfExists(path) {
    return readFile(path, "utf8").catch((error) => {
        if (error.code === "ENOENT") return null
        throw error
    })
}

async function main() {
    const PERMISSION_CODES = YAML.parse(await readFile(REGISTRY, "utf8")) ?? []
    const problems = validate(PERMISSION_CODES)
    if (problems.length > 0) {
        console.error("注册表有问题，一个字节都不写：")
        for (const problem of problems) console.error(`  - ${problem}`)
        process.exit(1)
    }

    const live = PERMISSION_CODES.filter((c) => !c.reserved)
    const java = renderJava(PERMISSION_CODES)
    const ts = renderTs(PERMISSION_CODES)
    const currentJava = await readIfExists(JAVA_TARGET)
    const currentTs = await readIfExists(TS_TARGET)
    const existing = currentJava ? extractJava(currentJava) : new Map()

    if (MODE === "audit") {
        const missing = [...existing.keys()].filter(
            (code) => !PERMISSION_CODES.some((c) => c.code === code),
        )
        console.log(
            `注册表已登记 ${PERMISSION_CODES.length} 条（${live.length} 条出常量），目标 Java 里有 ${existing.size} 条。\n`,
        )
        console.log(
            `待迁移 ${missing.length} 条（下面带的是 Java 里现有的注释，抄进注册表当 doc）：`,
        )
        for (const code of missing) {
            console.log(`\n  ${code}\n    现注释: ${existing.get(code).doc || "（无）"}`)
        }
        for (const card of live) {
            const before = existing.get(card.code)
            if (!before) continue
            console.log(`\n已登记 ${card.code}：注释是否搬对了，自己对一眼`)
            console.log(`    现注释: ${before.doc}`)
            console.log(`    将生成: ${expectedDoc(card)}`)
        }
        return
    }

    if (MODE === "preview") {
        await mkdir(PREVIEW_DIR, { recursive: true })
        await writeFile(join(PREVIEW_DIR, "Permissions.java"), java, "utf8")
        await writeFile(join(PREVIEW_DIR, "permission-codes.ts"), ts, "utf8")
        console.log(`预览写到 ${PREVIEW_DIR}（真实目标文件一个字节没动）`)
        console.log(`--- Permissions.java ---\n${java}`)
        console.log(`--- permission-codes.ts ---\n${ts}`)
        return
    }

    // check 与 write 都以「注册表覆盖全部既有码」为前提：少了码就落盘 = 静默删掉别人的常量
    const missing = [...existing.keys()].filter(
        (code) => !PERMISSION_CODES.some((c) => c.code === code),
    )
    if (missing.length > 0) {
        console.error(
            `注册表少登记 ${missing.length} 条码（${missing.join(", ")}），` +
                (MODE === "write"
                    ? "拒绝写入——那会把它们从 Java/TS 里删掉。先跑 --audit 拿迁移工作单。"
                    : "--check 此刻只能判「生成物比目标少」，不算通过。"),
        )
        process.exit(MODE === "write" ? 1 : 0)
    }

    const drift = []
    const rendered = extractJava(java)
    for (const card of live) {
        const want = expectedDoc(card)
        const got = rendered.get(card.code)
        const old = existing.get(card.code)
        if (!old) {
            drift.push(`${card.code}: 目标 Java 里没有这条常量`)
            continue
        }
        if (normalizeDoc(old.doc) !== want) drift.push(`${card.code}: Java 注释与注册表不一致`)
        if (!currentTs || !extractTs(currentTs).has(card.code))
            drift.push(`${card.code}: TS 里没有这条`)
        if (got === undefined) drift.push(`${card.code}: 自检失败——生成物渲染出来却解析不到`)
    }

    if (MODE === "write") {
        await writeFile(JAVA_TARGET, java, "utf8")
        await writeFile(TS_TARGET, ts, "utf8")
        console.log(
            `已生成：Permissions.java 与 permission-codes.ts（${live.length} 条出常量 + ${PERMISSION_CODES.length - live.length} 条 reserved 占位）。记得跑 pnpm format。`,
        )
        return
    }

    if (drift.length > 0) {
        console.error("--check 不通过：")
        for (const line of drift) console.error(`  - ${line}`)
        process.exit(1)
    }
    console.log(
        `--check 通过：${live.length} 条出常量与两份生成物一致（另有 ${PERMISSION_CODES.length - live.length} 条 reserved 只登记词表）。`,
    )
}

/** 期望的注释正文。只取 javadoc 的**中间行**，与 extractJava 的捕获组对齐（不含 `/**` 定界符）。 */
const expectedDoc = (card) => normalizeDoc(javaDoc(card).slice(1, -1).join("\n"))

await main()
