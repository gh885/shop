/**
 * 错误码注册表 codegen —— `openapi/error-codes.mjs` 是唯一真相源，产出两份词表常量：
 *
 * - `apps/server/src/main/java/com/shop/platform/common/ErrorCodes.java`
 * - `packages/common/src/contract/error-codes.ts`
 *
 * 照 `scripts/i18n-codegen.mjs` 的三条规矩来（那里踩过坑，教训直接抄）：
 * 1. **先收齐、全校验，再一次性落盘**——半截生成物比没有生成物更糟；
 * 2. `--check` 是门禁本体，跑在 pre-push 与 CI，不一致非零退出并指出差在哪一条码；
 * 3. 生成物不许是「手改后再也没人重生成」的孤儿，所以覆盖注册表没写全时**拒绝写入**。
 *
 * `--check` 按**语义**比而不是按字节比：`spotless`（Google Java Format）会重排 javadoc 的换行，
 * 按字节比必然假红。这里从目标文件里抽出「常量名 + 它的文档注释」，与注册表渲染出的期望值做
 * 空白归一后的相等判断。格式归 spotless 管，内容归这里管。
 *
 * 用法：
 *   node scripts/error-codes-codegen.mjs --preview     # 写到 scripts/.error-codes-preview/，看产物长什么样
 *   node scripts/error-codes-codegen.mjs --audit       # 迁移工作单：目标文件里有、注册表里还没登记的码
 *   node scripts/error-codes-codegen.mjs --check       # 门禁：不一致即红（退出 1）
 *   node scripts/error-codes-codegen.mjs --write       # 落盘（要求注册表已覆盖目标里全部既有码）
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const ROOT = resolve(import.meta.dirname, "..")
const REGISTRY = join(ROOT, "openapi/error-codes.mjs")
const JAVA_TARGET = join(ROOT, "apps/server/src/main/java/com/shop/platform/common/ErrorCodes.java")
const TS_TARGET = join(ROOT, "packages/common/src/contract/error-codes.ts")
/** 预览落在系统临时目录：仓库里不留生成物，省得加 ignore，也不会被 vp check / fallow 扫到 */
const PREVIEW_DIR = join(tmpdir(), "shop-error-codes-preview")

/** 状态码白名单：注册表只写后端真发得出来的那些；本地失败与 2xx 漂移不住这份表（见 client-failure.ts） */
const ALLOWED_STATUS = new Set([400, 401, 403, 404, 409, 410, 413, 422, 429])
const CODE_SHAPE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/

const args = new Set(process.argv.slice(2))
const MODE = args.has("--write")
    ? "write"
    : args.has("--check")
      ? "check"
      : args.has("--audit")
        ? "audit"
        : "preview"

/** 注册表 → 一份 Java + 一份 TS 的期望内容 */
function renderJava(cards) {
    const lines = [
        "package com.shop.platform.common;",
        "",
        "/**",
        " * 错误码常量：全后端唯一的 code 定义处，抛出点只引用这里的常量，不再各抄一遍字面量。",
        " *",
        " * <p><b>本文件由 {@code node scripts/error-codes-codegen.mjs} 从 {@code openapi/error-codes.mjs}",
        " * 生成，不要手改</b>——手改的那一次会在下一个人跑 {@code pnpm errors:gen} 时静默消失。",
        " * 加一个码或改一句说明都改那份注册表（一张码一条卡：group / code / status / behavior / trigger / notes），",
        " * 顺序 = 数组顺序；{@code --check} 把生成物与注册表核回来（按语义比，不按字节：排版归 spotless 管）。",
        " *",
        " * <p>定义原则（判据与普查口径见 docs/error-codes.md）：只有前端无法仅凭 HTTP status 区分时才加 code。",
        " * 三边等式（Java 常量 ⇄ 注册表 ⇄ {@code packages/common/src/contract/error-codes.ts}）由生成保证，",
        " * 剩下两边由 {@code ErrorCodeVocabularyTest} 核对（无库、不起 Spring、纯文本 + 反射）：注册表的码集合 ⇄",
        " * 两份 {@code error.json}（每码每语言恰一条非空），且每处抛码站点由工厂推出的状态码 ⇄ 注册表 status 列。",
        " *",
        " * <p>为什么值得收成常量：41 处抛出点此前各写一遍字符串，而 code 拼错是<b>无声</b>的——HTTP 状态照旧、",
        " * detail 照旧、接口测试若只断状态码也照旧绿，只有前端那条按 code 分支的逻辑静静地永不命中，",
        " * 表现为「偶尔提示不精准」。同一个码最多被抄了 6 遍（{@link #INVALID_TOKEN}），改一次的代价就是漏五次的收益。",
        " *",
        " * <p>值一个字符都没改：code 会经 {@code GlobalExceptionHandler} 写进 RFC 9457 响应的 {@code code} 属性，",
        " * 属于对外可观测行为（但不进 {@code openapi/api-docs.json}，所以不需要 {@code pnpm sdk:gen}）。",
        " * 前端自己判定的失败（断网 / 超时 / 取消 / 响应不合契约）不在本类，住",
        " * {@code packages/common/src/contract/client-failure.ts}。",
        " */",
        "public final class ErrorCodes {",
        "",
    ]
    let previousGroup = null
    for (const card of cards) {
        if (card.group !== previousGroup) {
            lines.push(`    // —— ${card.group} ——`, "")
            previousGroup = card.group
        }
        lines.push(...javaDoc(card))
        lines.push(`    public static final String ${card.code} = "${card.code}";`, "")
    }
    lines.push("    private ErrorCodes() {}", "}")
    return `${lines.join("\n")}\n`
}

/** 一条码只许一段 javadoc（两段并存时只有最后那段算 javadoc，前一段静默退成普通注释） */
function javaDoc(card) {
    const paras = [`${card.trigger}（HTTP ${card.status}）`, `<p>前端：${card.behavior}`]
    if (card.notes) paras.push(`<p>${card.notes}`)
    return ["    /**", ...paras.map((p) => `     * ${p}`), "     */"]
}

/**
 * 期望的注释正文。只取 javadoc 的**中间行**：抽取器的捕获组从 `/**` 之后开始，
 * 把定界符一起比进去会两边恒不相等（第一版就是这么全红的）。
 */
const expectedDoc = (card) => normalizeDoc(javaDoc(card).slice(1, -1).join("\n"))

function renderTs(cards) {
    const lines = [
        "/**",
        " * 服务端错误码常量：<b>本文件由 `scripts/error-codes-codegen.mjs` 从 `openapi/error-codes.mjs` 生成，",
        " * 不要手改。</b>与 `common.ErrorCodes`（Java 那份）逐常量对应，两边相等由生成保证；",
        " * 「注册表 ⇄ 两份 `error.json`」与「注册表 ⇄ 抛码站点状态码」由 `ErrorCodeVocabularyTest` 核对。",
        " * 定义原则（只有前端无法仅凭 HTTP status 区分时才加）与判据见 docs/error-codes.md。",
        " *",
        " * 前端自己判定的失败（断网 / 超时 / 取消 / 响应不合契约）**不在这份词表里**，",
        " * 住同目录的 `client-failure.ts`——那份词表的每个码都对得上一个 Java 常量与一处抛出点，",
        " * 掺进前端独有的码就需要一份豁免清单来让核对通过。",
        " */",
        "export const ErrorCodes = {",
    ]
    let previousGroup = null
    for (const card of cards) {
        if (card.group !== previousGroup) {
            if (previousGroup !== null) lines.push("")
            lines.push(`    // ${card.group}`)
            previousGroup = card.group
        }
        lines.push(
            "    /**",
            `     * ${card.status} — ${card.trigger}`,
            `     * 前端：${card.behavior}`,
            "     */",
            `    ${card.code}: "${card.code}",`,
        )
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
        if (!ALLOWED_STATUS.has(card.status)) {
            problems.push(
                `${at}: status=${card.status} 不在后端可发的白名单 {${[...ALLOWED_STATUS].join(", ")}}`,
            )
        }
        for (const field of ["group", "behavior", "trigger"]) {
            if (typeof card[field] !== "string" || card[field].trim() === "") {
                problems.push(`${at}: ${field} 必填——「前端行为」写空就是把这一栏留成愿望的老病`)
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
    const { ERROR_CODES } = await import(`file://${REGISTRY.replace(/\\/g, "/")}`)
    const problems = validate(ERROR_CODES)
    if (problems.length > 0) {
        console.error("注册表有问题，一个字节都不写：")
        for (const problem of problems) console.error(`  - ${problem}`)
        process.exit(1)
    }

    const java = renderJava(ERROR_CODES)
    const ts = renderTs(ERROR_CODES)
    const currentJava = await readIfExists(JAVA_TARGET)
    const currentTs = await readIfExists(TS_TARGET)
    const existing = currentJava ? extractJava(currentJava) : new Map()

    if (MODE === "audit") {
        const missing = [...existing.keys()].filter(
            (code) => !ERROR_CODES.some((c) => c.code === code),
        )
        console.log(`注册表已登记 ${ERROR_CODES.length} 条，目标 Java 里有 ${existing.size} 条。\n`)
        console.log(
            `待迁移 ${missing.length} 条（下面带的是 Java 里现有的注释，抄进注册表当 trigger）：`,
        )
        for (const code of missing) {
            console.log(`\n  ${code}\n    现注释: ${existing.get(code).doc || "（无）"}`)
        }
        for (const card of ERROR_CODES) {
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
        await writeFile(join(PREVIEW_DIR, "ErrorCodes.java"), java, "utf8")
        await writeFile(join(PREVIEW_DIR, "error-codes.ts"), ts, "utf8")
        console.log(`预览写到 ${PREVIEW_DIR}（真实目标文件一个字节没动）`)
        console.log(`--- ErrorCodes.java ---\n${java}`)
        console.log(`--- error-codes.ts ---\n${ts}`)
        return
    }

    // check 与 write 都以「注册表覆盖全部既有码」为前提：少了码就落盘 = 静默删掉别人的常量
    const missing = [...existing.keys()].filter((code) => !ERROR_CODES.some((c) => c.code === code))
    if (missing.length > 0) {
        console.error(
            `注册表少登记 ${missing.length} 条码（${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}），` +
                (MODE === "write"
                    ? "拒绝写入——那会把它们从 Java/TS 里删掉。先跑 --audit 拿迁移工作单。"
                    : "--check 此刻只能判「生成物比目标少」，不算通过。"),
        )
        if (MODE === "check") console.error("（预期内：迁移没做完。做完后这条自己消失。）")
        process.exit(MODE === "write" ? 1 : 0)
    }

    const drift = []
    for (const card of ERROR_CODES) {
        const want = expectedDoc(card)
        const got = extractJava(java).get(card.code)
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
            `已生成：ErrorCodes.java 与 error-codes.ts（${ERROR_CODES.length} 条码）。记得跑 pnpm format。`,
        )
        return
    }

    if (drift.length > 0) {
        console.error("--check 不通过：")
        for (const line of drift) console.error(`  - ${line}`)
        process.exit(1)
    }
    console.log(`--check 通过：${ERROR_CODES.length} 条码与两份生成物一致。`)
}

await main()
