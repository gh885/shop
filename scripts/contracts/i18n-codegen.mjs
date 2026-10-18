/**
 * i18n codegen：校验资源并生成各所有者的 key、参数和翻译函数类型。
 语法、跨语言覆盖、参数、译文同文和未使用 key 检查失败时不写生成物。
 * 应用词典只检查本端与共享包（common / i18n / monitoring / client）的引用，共享词典检查所有使用端。
 * ICU 不得直接格式化金额；消息编译使用与运行时相同的 intl-messageformat。
 * 语言策略直接读取 contracts/i18n.config.yaml，同时生成前端运行配置。
 */

import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { IntlMessageFormat } from "intl-messageformat"
import { readI18nConfig, renderI18nConfig } from "./i18n-config.mjs"

import { out as makeOut } from "../lib/out.mjs"

const ROOT = resolve(import.meta.dirname, "..", "..")
const CONFIG = await readI18nConfig()
const SUPPORTED_LOCALES = Object.keys(CONFIG.locales).filter((locale) =>
    Object.hasOwn(CONFIG.locales[locale].content, "ui"),
)
const SOURCE_LOCALE = CONFIG.contentTypes.ui.sourceLocale
const REQUIRE_COMPLETE = CONFIG.contentTypes.ui.requireComplete

/**
 * 清单的唯一出处（契约 1）。`*` 在这里展开，别在别处再写一遍 apps/web…
 *
 * 消费点是各 root 的 `src/locales/use-t.ts`（app-kit 那份是 `useT`）：它把这里的 `XTranslate`
 * 交给本端的 `useT()`，于是 `t(key, params)` 的 key 与参数变成编译期判定（类型与资源生成规则 的表）。
 * 「产了类型却没人消费」不用在这里标——那种类型导出会被 `pnpm fallow` 报成死代码。
 */
const MANIFEST = [{ glob: "apps/*/src/locales", label: (name) => cap(name) }]

/** app-kit 那份共享资源与三端同等待遇，只是 root 数固定为一个；`translateAppKit` 已按类型收 key/params */
const EXTRA_ROOTS = [{ dir: "packages/app-kit/src/locales", label: () => "AppKit" }]

/** AST 节点类型（@formatjs/icu-messageformat-parser 的数字枚举，实测取值见 类型与资源生成规则） */
const TEXT = 0
const ARGUMENT = 1
const NUMBER = 2
const DATE = 3
const TIME = 4
const SELECT = 5
const PLURAL = 6
const POUND = 7

/** 每条消息的参数：name → TS 类型文本。select/plural 给字面量联合，其余按格式化槽位推 */
function collectParams(ast) {
    const params = new Map()
    walk(ast)
    return params

    function walk(nodes) {
        for (const node of nodes) {
            switch (node.type) {
                case TEXT:
                case POUND:
                    break
                case ARGUMENT:
                    add(node.value, "string | number")
                    break
                case NUMBER: {
                    if (styleName(node) === "currency") {
                        throw new MoneyInMessageError()
                    }
                    add(node.value, "number")
                    break
                }
                case DATE:
                case TIME:
                    add(node.value, "Date | number | string")
                    break
                case SELECT:
                    add(node.value, literals(Object.keys(node.options)))
                    for (const option of Object.values(node.options)) walk(option.value)
                    break
                case PLURAL:
                    add(node.value, "number")
                    for (const option of Object.values(node.options)) walk(option.value)
                    break
                default:
                    throw new Error(`未知的 ICU 节点类型 ${node.type}`)
            }
        }
    }

    function add(name, type) {
        const previous = params.get(name)
        params.set(name, previous === undefined ? type : union(previous, type))
    }
}

/** `{x, number, currency}` 与 `{x, number, ::currency/CNY}` 两种写法都要拦：金额展示只走 formatMoney */
function styleName(node) {
    const { style } = node
    if (typeof style === "string") return style
    if (style && typeof style === "object") {
        const parsed = style.parsedOptions ?? {}
        if (parsed.style) return parsed.style
        for (const token of style.tokens ?? []) {
            if (token.stem === "currency") return "currency"
        }
    }
    return undefined
}

class MoneyInMessageError extends Error {}

/**
 * 生成物与漂移比对都要跨机器字节稳定，所以固定用 UTF-16 码元序（`Array#sort` 无参时的序），
 * 不用 `localeCompare` —— 它随运行机器的 locale 变，同一份资源在 CI 和本机能排出两份文件。
 */
function byCodeUnit(a, b) {
    if (a < b) return -1
    if (a > b) return 1
    return 0
}

function literals(optionNames) {
    const uniq = [...new Set(optionNames)].toSorted(byCodeUnit)
    return uniq.map((value) => JSON.stringify(value)).join(" | ")
}

function union(a, b) {
    if (a === b) return a
    const parts = new Set()
    for (const side of [a, b]) {
        for (const part of side.split(" | ")) {
            if (part.startsWith('"')) parts.add(part)
            else for (const atom of part.split(" | ")) parts.add(atom)
        }
    }
    const strings = [...parts].filter((part) => part.startsWith('"')).toSorted(byCodeUnit)
    const atoms = [...parts].filter((part) => !part.startsWith('"')).toSorted(byCodeUnit)
    return [...atoms, ...strings].join(" | ")
}

async function listJsonFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) return listJsonFiles(path)
            return entry.isFile() && entry.name.endsWith(".json") ? [path] : []
        }),
    )
    return nested.flat().toSorted(byCodeUnit)
}

async function expandManifest() {
    const matched = await Promise.all(
        MANIFEST.map(async (entry) => {
            const [parent, star, ...tail] = entry.glob.split("/")
            if (star !== "*") throw new Error(`MANIFEST 只支持一段通配：${entry.glob}`)
            const entries = await readdir(join(ROOT, parent), { withFileTypes: true })
            const dirs = entries
                .filter((dir) => dir.isDirectory())
                .toSorted((a, b) => byCodeUnit(a.name, b.name))
            const roots = await Promise.all(
                dirs.map(async (dir) => {
                    const dirPath = join(ROOT, parent, dir.name, ...tail)
                    try {
                        await readdir(dirPath)
                    } catch {
                        return undefined // apps/server 之类没有 locales 目录，不是清单成员
                    }
                    return {
                        dir: [parent, dir.name, ...tail].join("/"),
                        label: entry.label(dir.name),
                    }
                }),
            )
            return roots.filter((root) => root !== undefined)
        }),
    )
    const extras = await Promise.all(
        EXTRA_ROOTS.map(async (extra) => {
            await readdir(join(ROOT, extra.dir)) // 这个必须在位，缺了就是清单坏了
            return { dir: extra.dir, label: extra.label() }
        }),
    )
    return [...matched.flat(), ...extras]
}

function cap(name) {
    return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * 读一个 root 的全部语言，判 资源生成规则中的生成期那四条。
 * 返回 { problems, files, catalogs }：problems 非空即不产生成物。
 * 条目一律记成 `{ value, locale, file }`，展示时拼 `${root.dir}/${locale}/${file}`——
 * 语言不进 namespace 身份，否则「en-US 少了整个 login.json」会跟源语言永远对不上。
 */
async function readRoot(root) {
    // 语言之间互不依赖，一次并发读；Promise.all 保序，所以 problems 仍是「按语言、按文件」的可读顺序
    const perLocale = await Promise.all(SUPPORTED_LOCALES.map((locale) => readLocale(root, locale)))
    const problems = []
    const files = []
    /** locale → key → entry */
    const catalogs = new Map()
    for (const result of perLocale) {
        problems.push(...result.problems)
        files.push(...result.files)
        if (result.catalog !== undefined) catalogs.set(result.locale, result.catalog)
    }

    problems.push(
        ...(REQUIRE_COMPLETE ? compareNamespaceSets(root, catalogs) : []),
        ...checkNamespaceNames(root, catalogs),
        ...compareKeys(root, catalogs),
        ...compileAndCompareParams(root, catalogs),
        ...findIdenticalTranslations(root, catalogs),
    )

    return { ...root, problems, files, catalogs }
}

/** 一个语言目录读成一个 catalog；catalog 为 undefined 表示这个语言整体不在（缺目录或空目录） */
async function readLocale(root, locale) {
    const dir = join(ROOT, root.dir, locale)
    const problems = []
    const files = []
    let found
    try {
        found = await listJsonFiles(dir)
    } catch {
        if (!REQUIRE_COMPLETE && locale !== SOURCE_LOCALE) {
            return { locale, problems, files, catalog: new Map() }
        }
        return {
            locale,
            problems: [`${root.dir}/${locale}：缺语言目录（缺一种语言等于那份文案整体不存在）`],
            files,
            catalog: undefined,
        }
    }
    if (found.length === 0) {
        if (!REQUIRE_COMPLETE && locale !== SOURCE_LOCALE) {
            return { locale, problems, files, catalog: new Map() }
        }
        return {
            locale,
            problems: [`${root.dir}/${locale}：目录里一个 .json 都没有`],
            files,
            catalog: undefined,
        }
    }

    const catalog = new Map()
    const contents = await Promise.all(
        found.map(async (path) => {
            const file = relativeTo(dir, path)
            const where = `${root.dir}/${locale}/${file}`
            try {
                return {
                    where,
                    file,
                    entries: Object.entries(JSON.parse(await readFile(path, "utf8"))),
                }
            } catch (error) {
                return { where, file, problem: `${where}：JSON 解析失败（${error.message}）` }
            }
        }),
    )
    for (const { where, file, entries, problem } of contents) {
        files.push(where)
        if (problem !== undefined) {
            problems.push(problem)
            continue
        }
        for (const [key, value] of entries) {
            if (typeof value !== "string") {
                problems.push(`${where}：${key} 的值不是字符串（资源平铺，namespace 由文件名给）`)
                continue
            }
            const taken = catalog.get(key)
            if (taken !== undefined) {
                problems.push(
                    `${root.dir}：key "${key}" 在 ${locale} 撞车，${location(taken)} 与 ${where}`,
                )
                continue
            }
            catalog.set(key, { key, value, locale, file, root: root.dir })
        }
    }
    return { locale, problems, files, catalog }
}

/**
 * 生成物里每个 namespace 占一个类型名（`nav.json` → `NavKeys`），所以两个文件 sanitize 成同一个
 * 标识符时不可能各自产出一条——那会让「打错 key 的报错只列本 namespace」变成假的。这条在这里判，
 * 而不是等 `namespacesOf` 撞上（`render` 只在零 problem 时才跑，那时这条已经报过了）。
 */
function checkNamespaceNames(root, catalogs) {
    const base = catalogs.get(SOURCE_LOCALE)
    if (base === undefined) return []
    const byType = new Map()
    const problems = []
    for (const entry of [...base.values()].toSorted((a, b) => byCodeUnit(a.key, b.key))) {
        const name = identifierOf(namespaceName(entry.file))
        const taken = byType.get(name)
        if (taken !== undefined && taken !== entry.file) {
            problems.push(
                `${root.dir}：资源文件 ${taken} 与 ${entry.file} 都变成 namespace 类型名 \`${name}Keys\`，改名其中一个`,
            )
            continue
        }
        byType.set(name, entry.file)
    }
    return problems
}

/** 语言与 namespace 都在条目上，报错时才算得出一处「文件」而不是一个孤零零的文件名 */
function location(entry) {
    return `${entry.root}/${entry.locale}/${entry.file}`
}

function filesOf(catalog) {
    return new Set([...catalog.values()].map((entry) => entry.file))
}

/**
 * 契约 6：未使用的 key。扫源码里出现的 key 字面量（带引号的），catalog 里有而源码里
 * 一条都找不到的即报错。
 *
 * 应用词典只扫描本端与共享包（common / i18n / monitoring / client）；共享词典扫描所有使用端。逐个 `.ts`/`.tsx`（跳过 `.d.ts`、生成物
 * `messages.gen.ts`、以及 locales 目录里的 .json）。只认**带引号**的整串，所以
 * `t("nav.home")`、导航表里的 `labelKey: "nav.order"`、`t(\`form.${x}\`)`
 * （拼出来的、没引号）都不算。拼 key 会在「拼出来的那个整串在源码里找不到」时逐条报出来——
 * 这正是把动态 key 改成字面量的那一步的提示。
 *
 * 漏报（少判）而不是误报：key 只在注释里被提到也算“用过了”，宁可漏报不误伤。
 */
async function findUnusedKeys(roots, keyUnions) {
    const sourcesByRoot = await Promise.all(
        roots.map(async (root) => ({ root, sources: await collectSourceTexts(root) })),
    )
    const problems = []
    for (const { root, sources } of sourcesByRoot) {
        const keys = keyUnions.get(root.dir)
        if (keys === undefined) continue
        for (const key of keys) {
            if (!sources.includes(`"${key}"`)) {
                problems.push(
                    `${root.dir}：key "${key}" 在所属应用及共享源码里没被引用（未使用的 key，见 资源校验规则）`,
                )
            }
        }
    }
    return problems
}

async function collectSourceTexts(root) {
    const dirs = root.dir.startsWith("apps/")
        ? [
              join(ROOT, root.dir, ".."),
              join(ROOT, "packages/common/src"),
              join(ROOT, "packages/i18n/src"),
              join(ROOT, "packages/monitoring/src"),
              join(ROOT, "packages/client/src"),
          ]
        : []
    if (dirs.length === 0) {
        for (const group of ["apps", "packages"]) {
            const entries = await readdir(join(ROOT, group), { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory()) dirs.push(join(ROOT, group, entry.name, "src"))
            }
        }
    }
    const texts = []
    for (const dir of dirs) {
        for (const file of await listSourceFiles(dir)) {
            texts.push(await readFile(file, "utf8"))
        }
    }
    return texts.join("\n")
}

async function listSourceFiles(dir) {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return []
    }
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) {
                // locales 目录里只有 .json（资源）与 messages.gen.ts（生成物），两者都不是引用点
                if (entry.name === "locales") return []
                return listSourceFiles(path)
            }
            if (!entry.isFile()) return []
            if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".gen.ts")) return []
            if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) return []
            return [path]
        }),
    )
    return nested.flat().toSorted(byCodeUnit)
}

/** 语言之间按 namespace 比一次，好让「整个文件忘了翻」是一条能读出来的错，而不是几百条缺 key */
/** 「译文与源语言逐字相同」的白名单：术语、纯符号等本来就不该翻译的 key。加一条要写理由——
 *  译文照抄源语言等于没翻，类型与覆盖检查都看不见它，只有这条判据拦得住。 */
const IDENTICAL_TRANSLATION_OK = new Set([
    // SKU 是通用术语，中英同形
    "apps/seller/src/locales/product.json#product.editSku.col.sku",
    // "{from} ~ {to}" 是纯占位符加区间符号，没有可翻译的词
    "apps/admin/src/locales/cms.json#cms.display.window.range",
    // "…" 是省略号符号
    "packages/app-kit/src/locales/ui.json#ui.dataTable.paginationEllipsis",
])

/** 非源语言的译文不得与源语言逐字相同（key 在、值也在，只是照抄了源语言——最隐蔽的「没翻译」） */
function findIdenticalTranslations(root, catalogs) {
    const problems = []
    const base = catalogs.get(SOURCE_LOCALE)
    if (base === undefined) return problems
    for (const [locale, catalog] of catalogs) {
        if (locale === SOURCE_LOCALE) continue
        for (const [key, entry] of catalog) {
            const source = base.get(key)
            if (source === undefined || entry.value !== source.value) continue
            if (IDENTICAL_TRANSLATION_OK.has(`${root.dir}/${entry.file}#${key}`)) continue
            problems.push(
                `${location(entry)}：${key} 的译文与 ${SOURCE_LOCALE} 逐字相同（${JSON.stringify(entry.value)}），` +
                    `要么补翻译，要么把「本来就不该翻译」登记进 IDENTICAL_TRANSLATION_OK`,
            )
        }
    }
    return problems
}

function compareNamespaceSets(root, catalogs) {
    const problems = []
    const base = catalogs.get(SOURCE_LOCALE)
    if (base === undefined) return problems
    const baseFiles = [...filesOf(base)].toSorted(byCodeUnit)
    for (const [locale, catalog] of catalogs) {
        if (locale === SOURCE_LOCALE) continue
        const localeFiles = [...filesOf(catalog)].toSorted(byCodeUnit)
        for (const file of baseFiles) {
            if (!localeFiles.includes(file)) {
                problems.push(
                    `${root.dir}/${locale}/${file}：整个文件缺失（${SOURCE_LOCALE} 有这份）`,
                )
            }
        }
        for (const file of localeFiles) {
            if (!baseFiles.includes(file)) {
                problems.push(
                    `${root.dir}/${locale}/${file}：${SOURCE_LOCALE} 没有这份，源语言缺一条消息`,
                )
            }
        }
    }
    return problems
}

function compareKeys(root, catalogs) {
    const problems = []
    const base = catalogs.get(SOURCE_LOCALE)
    if (base === undefined) return problems
    for (const [locale, catalog] of catalogs) {
        if (locale === SOURCE_LOCALE) continue
        for (const key of base.keys()) {
            if (REQUIRE_COMPLETE && !catalog.has(key)) {
                problems.push(
                    `${root.dir}/${locale}：缺 key "${key}"（源在 ${location(base.get(key))}）`,
                )
            }
        }
        for (const key of catalog.keys()) {
            if (!base.has(key)) {
                problems.push(
                    `${root.dir}/${locale}：多余 key "${key}"（${catalog.get(key).file}）`,
                )
            }
        }
    }
    return problems
}

/** 逐条编译 + 跨语言比参数。这里用的就是运行时那个 IntlMessageFormat，不另写一套语法近似 */
function compileAndCompareParams(root, catalogs) {
    const problems = []
    const base = catalogs.get(SOURCE_LOCALE)
    if (base === undefined) return problems

    for (const catalog of catalogs.values()) {
        for (const entry of catalog.values()) {
            try {
                entry.params = collectParams(astOf(entry.value, entry.locale))
            } catch (error) {
                problems.push(
                    error instanceof MoneyInMessageError
                        ? `${location(entry)}：消息里用 number/currency 格式化金额。金额展示只走 formatMoney / ` +
                              `共享 Price（AGENTS.md「Money」），把槽位改成普通参数并传已格式化的文本`
                        : `${location(entry)}：${entry.key} 在 ${entry.locale} 下不是合法 ICU（${error.message}）`,
                )
            }
        }
    }

    for (const [key, source] of base) {
        if (source.params === undefined) continue
        for (const [locale, catalog] of catalogs) {
            const entry = catalog.get(key)
            if (entry === undefined || entry.params === undefined || entry === source) continue
            const a = [...source.params.keys()].toSorted(byCodeUnit).join(", ")
            const b = [...entry.params.keys()].toSorted(byCodeUnit).join(", ")
            if (a !== b) {
                problems.push(
                    `${location(entry)}：参数集合与 ${SOURCE_LOCALE} 不一致（${SOURCE_LOCALE}={${a}}，${locale}={${b}}）`,
                )
            }
        }
    }

    return problems
}

function astOf(template, locale) {
    return new IntlMessageFormat(template, locale).getAst()
}

function relativeTo(dir, path) {
    return path.slice(dir.length + 1).replaceAll("\\", "/")
}

function relativeToRoot(path) {
    return relativeTo(ROOT, path)
}

/**
 * namespace = 资源文件名去掉 `.json`（资源组织约定「namespace 由文件名给」），也就是 review 与 ownership
 * 的最小单元。分成 per-namespace 类型不是为了好看：全局 `XMessageKey` 联合一旦铺到几千条，
 * 打错 key 时 TS 把整个联合列出来、报错长到读不完——收窄形态让那行只列本 namespace 的 key。
 *
 * 文件名 → 类型名走 `identifierOf`（`nav.json` → `NavKeys`）。不带 root 前缀是因为每个 root 的
 * 生成物只被自己那端 import；两个文件 sanitize 成同一个标识符由 `checkNamespaceNames` 判成 problem。
 */
function namespacesOf(root, base) {
    const groups = new Map()
    for (const entry of base.values()) {
        const file = namespaceName(entry.file)
        const ns = groups.get(file)
        if (ns === undefined)
            groups.set(file, { file, type: identifierOf(file), keys: [entry.key] })
        else ns.keys.push(entry.key)
    }
    return [...groups.values()].toSorted((a, b) => byCodeUnit(a.file, b.file))
}

/** namespace 的名字就是资源文件名去掉 `.json`（资源组织约定：namespace 由文件名给）；调用侧写 `useT("nav")` */
function namespaceName(file) {
    return file.replace(/\.json$/, "")
}

function identifierOf(file) {
    return file
        .replace(/\.json$/, "")
        .split(/[^A-Za-z0-9]+/)
        .filter((part) => part !== "")
        .map(cap)
        .join("")
}

function render(root, keys) {
    const base = root.catalogs.get(SOURCE_LOCALE)
    const P = root.label

    const lines = [
        "// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）",
        `// 来源：${root.dir}/{${SUPPORTED_LOCALES.join(", ")}}/*.json`,
        "// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、",
        "// 各语言参数集合一致、没有译文照抄源语言。这条保证属于生成期，手改这份文件不会让它成立。",
        ...translateImports(root),
        "",
        ...namespaceTypes(root, base),
        "",
        `/** 本 root 全部 key 的联合（各 \`{Ns}Keys\` 的并集）。铺到几千条后打字面量会很难受，`,
        ` *  所以按 namespace 收窄的入口是 \`${P}ScopedT\`——见 按资源文件收窄 key 的约定。 */`,
        `export type ${P}MessageKey = ${P}Namespace[keyof ${P}Namespace]`,
        "",
        ...paramsTypes(root, keys, base),
        ...translateTypes(root),
        ...scopedTypes(root),
        `/** 一种语言里 ${P}MessageKey 的每一个都得有一句 */`,
        `export type ${P}Catalog = { [K in ${P}MessageKey]: string }`,
        "",
    ]
    return lines.join("\n")
}

/**
 * 每个 namespace 一份 `{Ns}Keys`，外加 namespace 名 → key 类型的映射 `{P}Namespace`。
 *
 * 参数不进 per-namespace 类型：key 在一个 root 内是全局唯一的，带参的那几条按 key 查
 * `{P}ParamsOf` 已经准（收窄后 K 仍是那联合的子集），多切一层只会多出一批没人用的导出——
 * 而「产了类型没人消费」按 生成类型契约 是要报出来的（`pnpm fallow` 判死代码）。
 */
function namespaceTypes(root, base) {
    const namespaces = namespacesOf(root, base)
    const lines = []
    for (const ns of namespaces) {
        lines.push(
            `/** namespace \`${ns.file}\`：${ns.keys.length} 条。收窄入口 \`${root.label}ScopedT<"${ns.file}">\` */`,
            `export type ${ns.type}Keys =`,
            ...ns.keys.map(
                (key, index) =>
                    `    ${JSON.stringify(key)}${index === ns.keys.length - 1 ? "" : " |"}`,
            ),
            "",
        )
    }
    lines.push(
        "/**",
        " * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，",
        ` *  也是收窄形态 \`${root.label}ScopedT\` 的入口。`,
        " */",
        `export type ${root.label}Namespace = {`,
        ...namespaces.map((ns) => `    ${JSON.stringify(ns.file)}: ${ns.type}Keys`),
        "}",
    )
    return lines
}

/** app 那份 `Translate` 要并上 app-kit 的共享 key，所以得引它的类型 */
function translateImports(root) {
    if (root.label === "AppKit") return []
    return ["", 'import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"']
}

function translateTypes(root) {
    const P = root.label
    if (P === "AppKit") {
        return [
            "/**",
            " * app-kit 自己的 `t` 形状：只认自己的资源。三端调用侧不用它——各端生成物里那份",
            " * `XTranslate` 把本端 key 与这份并在一起，与运行时的解析链同一条（先查本端资源、再查共享资源）。",
            " * 无参消息不接收参数；带参消息必须提供完整参数。",
            " */",
            `export type ${P}Translate = <K extends ${P}MessageKey>(`,
            `    key: K,`,
            `    ...args: ${P}ParamsOf<K> extends undefined ? [] : [params: ${P}ParamsOf<K>]`,
            ") => string",
            "",
        ]
    }
    return [
        "/**",
        " * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的",
        " * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。",
        " * 带参消息使用必需参数元组，漏传参数在编译时失败。",
        " * ICU 类型由 codegen 生成；运行时交给 i18next-icu。",
        " * 这是 类型与资源生成规则 分工表里唯一那条「编译期」保证在三端兑现的地方。",
        " */",
        `export type ${P}Translate = <K extends ${P}MessageKey | AppKitMessageKey>(`,
        "    key: K,",
        `    ...args: (K extends ${P}MessageKey ? ${P}ParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined`,
        `        ? [] : [params: K extends ${P}MessageKey ? ${P}ParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]`,
        ") => string",
        "",
    ]
}

/**
 * 收窄形态：`useT("nav")` 拿到的那份 `t`，key 位只收 `nav.json` 那几十条。
 *
 * 它解决的是 按资源文件收窄 key 的约定记下的那个担心：`XMessageKey` 是个全局联合，铺完 P2 到几千条之后
 * 打错 key 时 TS 把整个联合列出来，报错长到读不完。先选 namespace 再看本 namespace 的候选，
 * 报错长度就与总量解耦了。
 *
 * 三条形状上的选择，都是有意收窄而不是省事：
 * - **key 仍是完整的语义 key**（`t("nav.home")` 不是 `t("home")`）。资源校验规则 契约 6 那条
 *   「key 有没有被引用」的扫描靠带引号的整串，菜单表的 `labelKey: XMessageKey` 也一样；
 *   省掉业务域会让这两处的判据同时失效。
 * - **不并入 app-kit 的共享 key**（`login.*` / `error.*` / `validation.*`）。并进去报错里
 *   又多 100+ 条，等于没收窄；要共享文案就用不传 namespace 的整份 `t`。
 * - **参数仍走整份的 `{P}ParamsOf<K>`**：key 在一个 root 内全局唯一，带参的那几条按 key 查
 *   就是准的，而 K 已是全联合的子集；per-namespace 再切一层只会多出一批没人用的导出。
 */
function scopedTypes(root) {
    const P = root.label
    return [
        "/**",
        ' * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，',
        " * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。",
        " * 要 app-kit 的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。",
        " */",
        `export type ${P}ScopedT<N extends keyof ${P}Namespace> = <K extends ${P}Namespace[N]>(`,
        "    key: K,",
        `    ...args: ${P}ParamsOf<K> extends undefined ? [] : [params: ${P}ParamsOf<K>]`,
        ") => string",
        "",
    ]
}

/**
 * `ParamsByKey` 用映射类型而不是逐条条件链：后者在零条带参消息时会让 `K` 变成未使用类型参数
 * （TS6196 直接把 typecheck 打红），映射类型 + 一条 `K extends keyof` 两种情形都写得下。
 * 无参消息的参数位是 `undefined`，不是 `Record<never, never>`：后者看着等价，实则对象字面量
 * 对它不做超额属性检查，`t("零参 key", { brand: "x" })` 会静静通过（探针实测）。
 *
 * `ParamsByKey` **对外导出**（`ParamsOf` 已经是）：它与 `MessageKey` 一起是
 * `messageFactFactory`那份事实工厂的两个类型实参——业务域写
 * `messageFactFactory<Extract<{P}MessageKey, \`前缀.\${string}\`>, {P}ParamsByKey>()` 就得到
 * 「key 收窄到本域 + 参数跟着每条消息自己的槽位」的出口，不必再手写 `err()` / `errWith()` 那一对。
 */
function paramsTypes(root, keys, base) {
    const P = root.label
    const withParams = keys.filter((key) => {
        const params = base.get(key).params
        return params !== undefined && params.size > 0
    })
    return [
        withParams.length === 0
            ? `export type ${P}ParamsByKey = Record<never, never>`
            : [
                  `export type ${P}ParamsByKey = {`,
                  ...withParams.map(
                      (key) => `    ${JSON.stringify(key)}: ${paramsType(base.get(key).params)}`,
                  ),
                  `}`,
              ].join("\n"),
        "",
        `export type ${P}ParamsOf<K extends ${P}MessageKey> = K extends keyof ${P}ParamsByKey`,
        `    ? ${P}ParamsByKey[K]`,
        "    : undefined",
        "",
    ]
}

function paramsType(params) {
    const fields = [...params].map(([name, type]) => `${name}: ${type}`)
    return `{ ${fields.join("; ")} }`
}

function keyUnionOf(catalogs) {
    const keys = new Set()
    for (const catalog of catalogs.values()) for (const key of catalog.keys()) keys.add(key)
    return [...keys].toSorted(byCodeUnit)
}

const MODE = process.argv.includes("--check") ? "check" : "write"
const o = makeOut(MODE === "check" ? "i18n:drift" : "i18n:gen")

const roots = await expandManifest()
if (roots.length === 0) {
    o.err(`i18n codegen：清单展开为空（MANIFEST=${MANIFEST.map((m) => m.glob).join(", ")}）`)
    process.exit(1)
}

const allFiles = []
const rendered = [
    { out: join(ROOT, "packages/i18n/src/config.gen.ts"), text: renderI18nConfig(CONFIG) },
]
const problems = []
const keyUnions = new Map()
for (const root of await Promise.all(roots.map((rootDir) => readRoot(rootDir)))) {
    if (root.problems.length > 0) {
        problems.push(...root.problems)
        continue
    }
    const keys = keyUnionOf(root.catalogs)
    if (keys.length === 0) {
        problems.push(`${root.dir}：清单里没有任何 key`)
        continue
    }
    allFiles.push(...root.files)
    keyUnions.set(root.dir, keys)
    rendered.push({
        out: join(ROOT, root.dir, "messages.gen.ts"),
        text: render(root, keys),
    })
}

// 契约 6：未使用的 key。只在其他判据都过了之后跑——先让「资源本身坏了」的报错先说完，
// 否则一份乱了的 catalog 会顺带把一堆 key 报成「没人用」，那不是真问题。
if (problems.length === 0) {
    problems.push(...(await findUnusedKeys(roots, keyUnions)))
}

if (process.argv.includes("--list")) {
    for (const file of allFiles.toSorted(byCodeUnit)) o.raw(file)
}

if (problems.length > 0) {
    o.err(`i18n codegen failed（${problems.length} 条，不写任何生成物）：`)
    for (const problem of problems) o.rawErr(`  - ${problem}`)
    process.exit(1)
}

if (MODE === "check") {
    const drift = await Promise.all(
        rendered.map(async ({ out, text }) =>
            (await readFile(out, "utf8").catch(() => undefined)) === text
                ? undefined
                : relativeToRoot(out),
        ),
    )
    const missing = drift.filter((path) => path !== undefined)
    if (missing.length > 0) {
        o.err(
            `i18n 生成物与资源不同步：${missing.join(", ")}\n  → 跑 pnpm i18n:gen 重新生成后连同资源一起提交`,
        )
        process.exit(1)
    }
    o.ok(`i18n codegen ok（${allFiles.length} 个资源文件，生成物无漂移）`)
    process.exit(0)
}

await Promise.all(rendered.map(({ out, text }) => writeFile(out, text, "utf8")))

/**
 * 资源变了就把 vitest 的 fs-module-cache 清掉。
 *
 * **为什么必须在这里清**：各端的资源装配走 `import.meta.glob("./*" + "/*.json")`，而 glob 的展开结果
 * 在**构建期**被烤进 `locales/index.ts` 的编译产物；`pnpm test` 带的 `--fs-module-cache` 按**该文件的
 * 内容哈希**复用那份产物。新增一个 namespace（`order.json`）并不改 `index.ts` 的内容，于是缓存命中、
 * 产物里还是没有新文件的那一份——症状是「t() 取不到模板、回落成 key 本身」，而 glob 在测试文件里
 * 当场展开又是全的。必须在生成资源时清理模块缓存，不能依赖修改 index.ts 触发失效。
 *
 * 这里是**该失效的权威时刻**：资源文件刚被读过、刚判过平齐，改的正是它们。顺带一提，本仓库自己
 * 就在这个陷阱上栽过（新增 namespace 后整套 web 用例红，而 `vp cache clean` 清的是 task 缓存、
 * 清不到它）。所以：只要资源动过，就把模块缓存整个丢掉——它本来就是可再生的。
 */
const MODULE_CACHE = join(ROOT, "node_modules", ".vitest-cache")
await rm(MODULE_CACHE, { recursive: true, force: true }).catch(() => {
    // 缓存目录不存在/被占用都不该让 codegen 失败：它是优化，不是产物
})

o.ok(
    `i18n codegen wrote ${rendered.length} 份生成物，覆盖 ${allFiles.length} 资源文件（语言：${SUPPORTED_LOCALES.join(", ")}）；已清 fs-module-cache（资源变了，glob 展开结果要重烤）`,
)
