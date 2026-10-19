import { SmsCodeRequestSchema } from "@shop/api/schemas"
import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { CONTACT_PHONE_PATTERN } from "./domain/address"

// 共享词表门禁：一个概念在前端只许一个出口、且住在该住的包里；六条规则各挡一种漂移（见下面六个 describe 块）。证据：`useCountdown` 曾在 app-kit 与 web 各一份、同名不同义，复制粘贴静默换语义。不拥有契约（改它不触发 `sdk:gen`）；跨语言那半在 `apps/server` 的 `FieldRuleVocabularyTest`。

const REPO_ROOT = findRepoRoot()

const SOURCE_ROOTS = [
    "apps/web/src",
    "apps/seller/src",
    "apps/admin/src",
    "packages/common/src",
    "packages/i18n/src",
    "packages/monitoring/src",
    "packages/client/src",
    "packages/app-kit/src",
    "packages/ui-web/src",
]

/** 前五条看产品代码：生成物与测试不参与（routeTree/SDK 是产物，测试里的假数据不算第二份实现）；最后一条夹具规则反过来只看测试文件。vendored reui 两条都不参与——上游源码，「一个概念一个出口」只约束我们的实现 */
const EXCLUDED =
    /[\\/](routeTree\.gen\.ts|__generated__|test|tests?[\\/])|\.test\.tsx?$|[\\/]components[\\/]reui[\\/]/

function findRepoRoot(): string {
    let dir = import.meta.dirname
    for (let up = 0; up < 6; up++) {
        try {
            statSync(join(dir, "pnpm-workspace.yaml"))
            return dir
        } catch {
            dir = join(dir, "..")
        }
    }
    throw new Error("找不到仓库根（pnpm-workspace.yaml），共享词表门禁无从扫描")
}

function exportsOf(file: string): string[] {
    const text = code.get(file) ?? ""
    const names = new Set<string>()
    for (const [, name] of text.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
        if (name) names.add(name)
    }
    for (const [, group] of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of (group ?? "").split(",")) {
            const name = part
                .trim()
                .split(/\s+as\s+/)
                .pop()
                ?.trim()
            if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
        }
    }
    return [...names]
}

function sourceFiles(keep: (abs: string) => boolean = (abs) => !EXCLUDED.test(abs)): string[] {
    const out: string[] = []
    for (const root of SOURCE_ROOTS) {
        const abs = join(REPO_ROOT, root)
        if (statSync(abs, { throwIfNoEntry: false })) walkDir(abs)
    }
    function walkDir(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const abs = join(dir, entry.name)
            // 先按目录递归：只认后缀会把整棵子树当成「不是文件就跳过」，扫到的是空目录级
            if (entry.isDirectory()) {
                walkDir(abs)
                continue
            }
            if (!/\.(ts|tsx)$/.test(entry.name)) continue
            if (!keep(abs)) continue
            out.push(relative(REPO_ROOT, abs).replaceAll("\\", "/"))
        }
    }
    return out.toSorted()
}

/** 只剥块注释、不剥行注释：门禁挡「第二份实现」不挡「第二处提到」（注释里的 138****0000 是给人看的示例）；行注释里的形状会误报成红，宁误报不空转。owner 必须「剥完仍命中」（见下一条），否则注释吃掉整个文件也能骗绿 */
function stripBlockComments(text: string): string {
    return text.replaceAll(/\/\*[\s\S]*?\*\//g, "")
}

const files = sourceFiles()
/** 每个源文件读一次、剥一次注释：后面几条规则都在同一份「代码文本」上判 */
const code = new Map(
    files.map((file) => [file, stripBlockComments(readFileSync(join(REPO_ROOT, file), "utf8"))]),
)

/** 测试文件走相反的选择：最后那条夹具规则只看测试，前几条只看产品代码（reui 同理不参与） */
const testFiles = sourceFiles(
    (abs) => /\.test\.tsx?$/.test(abs) && !/[\\/]components[\\/]reui[\\/]/.test(abs),
)
const testCode = new Map(
    testFiles.map((file) => [
        file,
        stripBlockComments(readFileSync(join(REPO_ROOT, file), "utf8")),
    ]),
)

const exportedBy = new Map<string, string[]>()
for (const file of files) {
    for (const name of exportsOf(file)) {
        exportedBy.set(name, [...(exportedBy.get(name) ?? []), file])
    }
}

const isPackage = (file: string) => file.startsWith("packages/")
const isApp = (file: string) => file.startsWith("apps/")

/**
 * 规则 1 的**窄例外**：`useT` 故意在包与三端各有一份，不是复制粘贴——它是 i18n 的「按 root 参数化」（app-kit 那份认共享 catalog、三端各自认本端生成物 catalog），三端 use-t.ts 只是把本端类型接到 app-kit 的 `useTypedT`（同一实现 + 严格细化），调用点一律从本地导、没有跨包导，所以「静默换语义」在这里不成立。
 * 写成具名白名单而非放宽整条：将来第二个 app-local 符号撞名仍会照旧变红。加名字前先确认它也满足「同一实现 + 严格细化 + 调用点不跨包导」。
 */
const DELIBERATE_PARALLEL_EXPORTS = new Set(["useT"])

describe("app 不遮蔽 packages 的导出名", () => {
    it("同名 hook/util 出现在 app 本地和包里 = 复制粘贴会静默换语义", () => {
        const shadowed: string[] = []
        for (const [name, at] of exportedBy) {
            if (DELIBERATE_PARALLEL_EXPORTS.has(name)) continue
            const inPackage = at.filter(isPackage)
            const inApp = at.filter(isApp)
            if (inPackage.length > 0 && inApp.length > 0) {
                shadowed.push(`${name}：${[...inPackage, ...inApp].join(" / ")}`)
            }
        }
        expect(shadowed).toEqual([])
    })

    it("三端 useT 的类型重载必须直接返回同一个 useI18n 翻译器", () => {
        // 把例外钉住：白名单不是「以后 useT 随便重复」——三端必须各自只是把本端 catalog 接到 app-kit 的 useTypedT，出现第二份实现这里会红
        // 判「真的用了」不判「import 过」：只查字符串会被「import 留着、调用换掉」骗绿，所以匹配调用点 `useTypedT<`
        const useTFiles = (exportedBy.get("useT") ?? []).filter(isApp)
        expect(useTFiles).toHaveLength(3)
        for (const file of useTFiles) {
            expect(code.get(file) ?? "").toMatch(/return useI18n\(\)\.t/)
        }
    })

    it("扫描本身有效：真扫到了源码与导出", () => {
        expect(files.length).toBeGreaterThan(300)
        expect(exportedBy.size).toBeGreaterThan(200)
    })
})

describe("形状的写法只有一份", () => {
    const owners: Record<string, { pattern: RegExp; allowed: string[] }> = {
        手机号掩码段: {
            pattern: /\*\*\*\*/,
            // AddressFormDialog 的 139******** 是智能粘贴输入框的占位示例，不产出掩码也不与 MASK_SEGMENT 同形（8 星），非第二份实现
            allowed: [
                "packages/common/src/domain/mask.ts",
                "packages/ui-web/src/components/masked-value.tsx",
                "apps/web/src/address/AddressFormDialog.tsx",
            ],
        },
        大数折位算式: {
            // 折位已下沉 Intl（notation:"compact"），owner 仍是 count.ts 一处；pattern 跟着实现走，否则算式删掉后门禁空转成红
            pattern: /notation: "compact"/,
            allowed: ["packages/common/src/domain/count.ts"],
        },
        剪贴板写入: {
            pattern: /navigator\.clipboard\.writeText/,
            allowed: ["packages/app-kit/src/display/copy-text.ts"],
        },
        // 字段规则：形状与提示语各只有一份，owner 就是那条规则在前端的出口。下面几条空 allowed = 形状已由契约承载（从后端 @Pattern 生成的 `@shop/api/schemas` 那一格），前端任何文件都不许再出现该字面量；owner 就是生成物本身、不在 SOURCE_ROOTS 里，没有「剥完注释仍命中」可验，那半条由「命中必须是 0 处」等价承担
        手机号形状: {
            pattern: /1\[3-9\]\\d\{9\}/,
            allowed: [],
        },
        联系电话形状: {
            // `.{5}` 盖的是 `+\\-]` 那几个字符：这里要挡的是「同一条形状被抄第二遍」。
            pattern: /\[0-9.{5}\{5,20\}/,
            allowed: [],
        },
        // 六位数字形状（区划码/邮编）已由契约承载（regionCode/postalCode 都是后端 @Pattern 生成的那一格），前端不许再写。`\\{1,2}` 是「一到两个反斜杠」：正则字面量 `\d{6}` 与字符串 `\\d{6}` 两种都要挡
        六位数字形状: {
            pattern: /\\{1,2}d\{6\}/,
            allowed: [],
        },
    }

    for (const [what, { pattern, allowed }] of Object.entries(owners)) {
        it(`${what}只出现在 owner 文件`, () => {
            const hits: string[] = []
            for (const file of files) {
                if (allowed.includes(file)) continue
                const line = (code.get(file) ?? "").split("\n").findIndex((l) => pattern.test(l))
                if (line >= 0) hits.push(`${file}:${line + 1}`)
            }
            expect(hits).toEqual([])
        })

        // 空 allowed = 前端不许出现该形状（已由契约承载），没有 owner 可验「不空转」
        if (allowed.length === 0) continue

        it(`${what}的 owner 剥掉注释后仍命中：门禁不空转`, () => {
            for (const file of allowed) {
                if (file.startsWith("apps/")) continue
                expect(
                    pattern.test(code.get(file) ?? ""),
                    `${file} 是 ${what} 的 owner，剥完注释却找不到该形状`,
                ).toBe(true)
            }
        })
    }
})

describe("零内部依赖的包与 owner 不漂移", () => {
    it("ui-web 的掩码段逐字节等于 common 的 MASK_SEGMENT", () => {
        const uiweb = readFileSync(
            join(REPO_ROOT, "packages/ui-web/src/components/masked-value.tsx"),
            "utf8",
        )
        const common = readFileSync(join(REPO_ROOT, "packages/common/src/domain/mask.ts"), "utf8")
        const local = /const MASK_SEGMENT = "([^"]*)"/.exec(uiweb)?.[1]
        const owner = /export const MASK_SEGMENT = "([^"]*)"/.exec(common)?.[1]
        expect(local, "ui-web 里没找到 MASK_SEGMENT 常量，门禁不能空转").toBeTruthy()
        expect(local).toBe(owner)
    })
})

describe("owner 不是孤儿", () => {
    // 聚合入口 re-export 不算调用点，否则「owner 还在但没人用」也能蒙过这条
    // 判定在剥注释后的文本上做：注释里提一嘴 `maskPhone` 不等于有人在调
    const callsites = (symbol: string, owner: string): string[] =>
        files
            .filter((f) => f !== owner && !f.endsWith("src/index.ts"))
            .filter((f) => new RegExp(`\\b${symbol}\\b`).test(code.get(f) ?? ""))

    /** `[符号, 它住在哪个文件]`：owner 自己的定义不算调用点，所以逐个点名（与上一条的 allowed 同源） */
    const OWNED: [string, string][] = [
        ["maskPhone", "packages/common/src/domain/mask.ts"],
        ["MASK_SEGMENT", "packages/common/src/domain/mask.ts"],
        ["compactCount", "packages/common/src/domain/count.ts"],
        ["copyWithNotify", "packages/app-kit/src/display/copy-text.ts"],
        ["PhoneSchema", "packages/app-kit/src/auth/login-schema.ts"],
        ["SmsCodeSchema", "packages/app-kit/src/auth/login-schema.ts"],
        ["CAPTCHA_CODE_DIGITS", "packages/app-kit/src/auth/login-schema.ts"],
        ["NICKNAME_MAX", "packages/app-kit/src/auth/login-schema.ts"],
        ["NOTE_MAX", "packages/common/src/domain/note-fields.ts"],
        ["ProductNameSchema", "packages/common/src/domain/product-fields.ts"],
        ["SellPointSchema", "packages/common/src/domain/product-fields.ts"],
        // 规格那一档两个数各自有人用才算 owner：只在包导出里挂名而没人引用，仍是「看着对称」的死码
        ["SPEC_VALUES_MAX", "packages/common/src/domain/product-fields.ts"],
        ["SPEC_VALUE_MAX", "packages/common/src/domain/product-fields.ts"],
        ["AddressPhoneSchema", "packages/common/src/domain/address.ts"],
        ["ADDRESS_LABEL_MAX", "packages/common/src/domain/address.ts"],
        ["CUSTOM_LABEL_MAX", "apps/web/src/address/address-form.ts"],
        // 错误码在前端只有这一个出口：裸字符串比 code = 给自己发通行证（拼错不报错、那条分支永不命中），所以 owner 无人用也要钉住——三边相等由后端 ErrorCodeVocabularyTest 管，这条只管前端别再造第二份
        ["ErrorCodes", "packages/common/src/contract/error-codes.ts"],
        // 客户端本地失败（断网/超时/取消/响应不合契约）与上面那份服务端词表分家（理由见 client-failure.ts 文件头），同样只许这一个出口
        ["ClientFailureCodes", "packages/common/src/contract/client-failure.ts"],
        ["RESPONSE_VALIDATION_FAILED", "packages/common/src/contract/api-error.ts"],
        // 「这句话该由谁出」只有一个出口：app-kit 的 errorText（§7.3 那条链）。各区块自判必漂移——写成 `toApiError(err).detail || 站点文案` 的站点那句永远轮不上，直接读 detail 的英文界面漏中文
        ["errorText", "packages/app-kit/src/i18n/error-keys.ts"],
        // 程序化滚动的 behavior 只有一个取值处：各处手抄 "smooth" 就是无视「减少动效」
        ["scrollToTop", "packages/common/src/domain/scroll.ts"],
        ["scrollToElement", "packages/common/src/domain/scroll.ts"],
    ]

    for (const [symbol, owner] of OWNED) {
        it(`${symbol} 有真实调用点`, () => {
            expect(
                callsites(symbol, owner).length,
                `${symbol} 在 ${owner} 之外没有任何调用点：owner 已无人用，或扫描没扫到`,
            ).toBeGreaterThan(0)
        })
    }
})

/** 从 rest 头部解析一个原子（字符类/\\d/转义/单字面）+ 可选量词，认不出就抛 */
function matchAtom(rest: string): RegExpExecArray {
    const atom = /^(?<atom>\[[^\]]+\]|\\d|\\.)(?<q>\{\d+(?:,\d*)?\})?|(?<lit>[\w -])/.exec(rest)
    if (!atom) throw new Error(`认不出的正则构造（本门禁只认字符类、\\d、单字符）：${rest}`)
    return atom
}

/** 单个原子的字符数区间。认不出的构造直接抛（见 spanOf 的注释） */
function atomSpan(rest: string): { min: number; max: number; consumed: number } {
    const atom = matchAtom(rest)
    const token = atom.groups?.atom ?? atom.groups?.lit ?? ""
    const quant = quantBounds(atom.groups?.q)
    const consumed = token.length + (atom.groups?.q?.length ?? 0)
    if (quant) return { min: quant.min, max: quant.max, consumed }
    // 字符类、`\d`、单个字面字符都定长贡献一位；字面后面若真跟了量词（`1{2}`）下一轮从 spanOf 顶上抛「认不出的构造」
    return { min: 1, max: 1, consumed }
}

/** 解析量词 `{m}` / `{m,n}` 的上下界；开区间抛（本门禁不猜上界） */
function quantBounds(quant: string | undefined): { min: number; max: number } | undefined {
    if (!quant) return undefined
    const [lo, hi] = quant.slice(1, -1).split(",")
    if (hi === "") throw new Error(`开区间量词无法给出上界，本门禁不猜：${quant}`)
    return { min: Number(lo), max: Number(hi ?? lo) }
}

/**
 * 定长/区间正则的字符数：只认本仓库这几条形状用得上的构造（`\d` / 字符类、可选 `{m}` `{m,n}`、单个字面或转义字符）；遇到别的构造（分组、或、`*+?`）直接抛——返回 undefined 会让门禁在形状变复杂后悄悄失效，那正是本文件要挡的。
 */
function spanOf(shape: string): { min: number; max: number } {
    let rest = shape.replace(/^\^/, "").replace(/\$$/, "")
    let min = 0
    let max = 0
    while (rest.length > 0) {
        const span = atomSpan(rest)
        min += span.min
        max += span.max
        rest = rest.slice(span.consumed)
    }
    return { min, max }
}

describe("一个概念不许各说一半", () => {
    /** 从（已剥注释的）owner 源码里取一个常量：正则字面量取它的 source，数字常量取它的值 */
    function sourceOf(file: string, constant: string): string {
        const text = code.get(file) ?? ""
        const pattern = new RegExp(`^export const ${constant} = /(.*)/$`, "m").exec(text)
        const value = new RegExp(`^export const ${constant} = (\\d+)$`, "m").exec(text)
        const found = pattern?.[1] ?? value?.[1]
        expect(found, `${file} 里找不到具名常量 ${constant}，门禁不能空转`).toBeTruthy()
        return found ?? ""
    }

    it("手机号位数常量等于它旁边那条正则的长度", () => {
        const owner = "packages/app-kit/src/auth/login-schema.ts"
        // 形状已改由契约承载（不再写成源码里的正则字面量），所以取契约那一格——
        // 本包依赖 @shop/api，不能反向 import app-kit
        const { min, max } = spanOf(SmsCodeRequestSchema.properties.phone.pattern)
        const digits = Number(sourceOf(owner, "PHONE_DIGITS"))
        expect([min, max], "正则已不是定长，位数常量那个单值对不上").toEqual([digits, digits])
    })

    it("联系电话的 maxLength 上限等于那条形状的 {5,20} 上界", () => {
        const owner = "packages/common/src/domain/address.ts"
        const { max } = spanOf(CONTACT_PHONE_PATTERN)
        expect(
            Number(sourceOf(owner, "CONTACT_PHONE_MAX")),
            "输入框能敲进去的位数与校验放行的是两个数：改了形状不改这一格，多敲的字符提交必 400",
        ).toBe(max)
    })

    // 验证码位数（SMS_CODE_DIGITS）不在此列：那条形状由它自己拼出（`^\\d{${…}}$`），两边不可能各说一半，重复断言只是多一条会一起红的空话
})

/** 一个测试文件从 `@shop/api/sdk` 拿到的类型名：只有返回这些类型的夹具算「契约夹具」。 */
function sdkTypesOf(text: string): Set<string> {
    const names = new Set<string>()
    for (const [, group] of text.matchAll(
        /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"@shop\/api\/sdk"/g,
    )) {
        for (const part of (group ?? "").split(",")) {
            const name = part.trim().replace(/^type\s+/, "")
            if (/^[A-Z]\w*$/.test(name)) names.add(name)
        }
    }
    return names
}

/** `function 名字(...): 契约类型 {` 且函数体直接 `return {` 从零列字段才算重建；`{ ...别的夹具() }` 那种换名复用不算——它要的正是继承不是重建 */
const REBUILT_FIXTURE =
    /^function\s+\w+\([^)]*\)\s*:\s*([A-Z]\w*)\s*\{\s*\n?\s*return\s*\{(?!\s*\.)/gm

describe("域内槽位文件必须单一职责", () => {
    // 一个文件只许一种成分（槽位表见 docs/conventions/frontend.md「文件名即分层」）：
    // constants.ts 只放纯数据——函数、箭头定义、zod 各有自己的槽位（display.ts / form.ts），混进来必然漂移
    // rules.ts（业务出口统一此名，含 draft-rules.ts 这类限定形）只放语言无关的业务——import 本端 locales、收 Translate、写 UI variant 都算越权，去向是 display/constants
    const APP_SLOTS = /^apps\/(web|seller|admin)\/src\//
    const slotFiles = files.filter(
        (f) => APP_SLOTS.test(f) && /(^|\/)(constants|rules|.*-rules)\.ts$/.test(f),
    )

    it("constants.ts 是纯数据：不许 export function / 箭头函数常量 / zod", () => {
        const dirty: string[] = []
        for (const file of slotFiles) {
            if (!/(^|\/)constants\.ts$/.test(file)) continue
            const text = code.get(file) ?? ""
            if (
                /^export\s+(?:async\s+)?function\b/m.test(text) ||
                /^export\s+const\s+\w+(?:<[^>]*>)?(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s*)?\(/m.test(
                    text,
                ) ||
                text.includes('from "zod"')
            ) {
                dirty.push(file)
            }
        }
        expect(dirty).toEqual([])
    })

    it("rules.ts 是语言无关的业务：不许碰 locales/Translate/MessageKey/variant", () => {
        const dirty: string[] = []
        for (const file of slotFiles) {
            if (!/(^|\/)(rules|.*-rules)\.ts$/.test(file)) continue
            const text = code.get(file) ?? ""
            if (
                /#\/locales|messages\.gen|\b\w*Translate\b|MessageKey|\bvariant:|\btone:/.test(text)
            ) {
                dirty.push(file)
            }
        }
        expect(dirty).toEqual([])
    })

    it("扫描本身有效：槽位文件真扫到了", () => {
        expect(slotFiles.length).toBeGreaterThan(15)
    })
})

describe("契约夹具只搭一次", () => {
    /** 同一契约响应在两个测试文件各从零搭 = 两份默认值各漂（一处补字段一处没，MSW 的 zod 校验只先红一个文件，看着像那个文件坏了）；判据是「从零搭完整字面量」，`return makeCoupon({...})` 传自己 id 的 wrapper 不算重复 */
    const rebuilt = new Map<string, string[]>()
    for (const [file, text] of testCode) {
        const contractTypes = sdkTypesOf(text)
        for (const [, type] of text.matchAll(REBUILT_FIXTURE)) {
            if (!type || !contractTypes.has(type)) continue
            rebuilt.set(type, [...(rebuilt.get(type) ?? []), file])
        }
    }

    it("同一份契约响应不在两个测试文件里各搭一遍：那份默认值该住进 @shop/test-utils", () => {
        const duplicated = [...rebuilt]
            .filter(([, at]) => new Set(at).size > 1)
            .map(([type, at]) => `${type}：${[...new Set(at)].join(" / ")}`)

        expect(duplicated).toEqual([])
    })

    it("扫描本身有效：真扫到了从零搭契约响应的本地夹具", () => {
        // 数量掉到个位数 = 判据脱靶（签名换行方式变了、sdk import 写法变了），不能悄悄全绿
        expect(rebuilt.size).toBeGreaterThan(5)
    })
})
