import { SmsCodeRequestSchema } from "@shop/api/schemas"
import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { CONTACT_PHONE_PATTERN } from "./domain/address"

/**
 * 共享词表门禁：一个概念在前端只许有一个出口，且那个出口住在它该住的包里。
 *
 * 后端有 `ValidationVocabularyTest` 钉「一条规则一个具名常量」，前端一直是靠人记得住。
 * 记不住的证据（本测试引入时都是真红）：`apps/web` 里 `DeletionDialog` 从 `@shop/app-kit`
 * 导入 `useCountdown`（相对秒数递减），同 app 的 `OrderCard` 从本地 `#/shared/lib/use-countdown`
 * 导入同名 hook（按绝对时刻倒数）——同名不同义，跨文件复制粘贴就会静默换语义。
 *
 * 六条规则各自挡一种漂移：
 * 1. **app 不遮蔽包导出**：app 本地导出的符号名不得与 `packages/*` 的导出名相同
 * 2. **形状的写法只有一份**：掩码段 / 折万算式 / 剪贴板调用 / 手机号形状 / 写进提示语里的那句话，
 *    字面量只许出现在 owner 里
 * 3. **owner 之间不互相漂移**：ui-web 刻意不依赖 common（纯 UI 包零内部依赖），
 *    它那两份字面量必须与 common 的 owner **逐字节相等**——常量等式编译期查不了，测试期钉
 * 4. **owner 不是摆设**：每个 owner 至少有一个真实调用点（顺带证明扫描确实扫到了代码）
 * 5. **一个概念不许各说一半**：位数常量与它旁边那条正则必须由同一个数推出来
 *    （`PHONE_DIGITS = 11` 与 `/^1[3-9]\d{9}$/` 是两处，改形状不改位数=框里能敲 11 位、提交必 400）
 * 6. **契约夹具只搭一次**（看的是测试文件）：同一份契约响应在两个测试文件里各从零搭一遍，
 *    就是两份会各漂各的默认值——那份该住进 `@shop/test-utils`
 *
 * 与 `sdk:audit` 一样，它不拥有契约：这些是展示层内部约定，改它们不触发 `pnpm sdk:gen`。
 * 跨语言那一半（Java / OpenAPI / 迁移列宽）在 `apps/server` 的 `FieldRuleVocabularyTest`，
 * 本文件只管「前端内部不许有第二份」。
 */

const REPO_ROOT = findRepoRoot()

/** 扫描范围：真正会互相 import 的源码，不含生成物 */
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

/** 生成物与测试不参与（前五条看的是产品代码）：routeTree/SDK 是产物，测试里的假数据不算第二次实现。
    最后一条「契约夹具」反过来只看测试文件，判据也不同——见那里的注释。
    第三方 vendored 组件（ui-web 的 reui/**）两条规则都不参与：那些是上游源码，
    「同一概念只许一个出口」约束的是我们自己的实现，不能要求第三方重写它的内部行为
    （如 data-grid 的电子表格剪贴板与我们业务用的 copy-text 是两回事）。 */
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

/** 一个 .ts/.tsx 文件里 `export function X` / `export const X` / `export { X }` 的具名导出 */
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

/**
 * 剥掉块注释后的文本：门禁要挡的是「第二份实现」，不是「第二处提到」。
 * `ReceiverLine` 的注释里写着 `138****0000` 那是给人看的示例，改不动也不该改。
 * 只剥 `/* *\/` 不剥行注释——行注释里的形状会误报成红，宁误报不空转。
 * 每个形状的 owner 必须「剥完仍命中」（见下一条测试），否则注释吃掉整个文件也能骗绿。
 */
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
 * 规则 1 的**窄例外**：`useT` 故意在包与三端各有一份，不是复制粘贴的意外。
 *
 * 这一个符号是 i18n 的「按 root 参数化」：`@shop/app-kit` 的 `useT` 认 app-kit 自己那份
 * catalog（共享资源），三端 `src/locales/use-t.ts` 的 `useT` 认本端生成物那份 catalog。
 * 它们是同一机制的四个 root（各自的 key 集合不同，所以类型不同），共享的运行时实现与
 * 唯一那处类型断言都在 app-kit 的 `useTypedT` 里——三端 use-t.ts 只做「把本端 catalog
 * 的类型接到调用点上」，各自不到十行、注释里也写明了理由。
 *
 * 与规则 1 想拦的东西（复制粘贴同名不同义的 hook）不同：这里 app-local 的 `useT` 是包级
 * `useT` 的**严格细化**（同一实现、收窄的 key 集合），且三端调用点一律从本地
 * `#/locales/use-t` 导入、没有从 `@shop/app-kit` 导入 `useT`（包的 `useT` 只在 app-kit
 * 自己的组件里用），所以「静默换语义」在这里不成立。
 *
 * 写成具名白名单而不是放宽整条规则：将来若真有第二个 app-local 符号与包重名（那才是漂移），
 * 它会照旧变红。改动这个白名单时，请先确认新加的名字也满足「同一实现 + 严格细化 + 调用点不跨包导」三条。
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
        // 这条把例外钉住：白名单不是「以后 useT 随便重复」——三端 use-t.ts 必须各自
        // 只是把本端 catalog 类型接到 app-kit 的 useTypedT 上。真出现第二份实现时这里会红。
        // 判「真的用了」而不是「import 过」：只查字符串会被「import 留着、调用换掉」骗绿
        //（那正是本条要拦的形状），所以匹配的是调用点 `useTypedT<`。
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
            // AddressFormDialog 的 `139********` 是「智能粘贴」输入框的占位示例文案，
            // 不是第二份掩码实现：它既不产出掩码，也不与 MASK_SEGMENT 同形（8 个星）。
            allowed: [
                "packages/common/src/domain/mask.ts",
                "packages/ui-web/src/components/masked-value.tsx",
                "apps/web/src/address/AddressFormDialog.tsx",
            ],
        },
        大数折位算式: {
            // 折位已下沉 Intl（notation:"compact"），owner 仍是 count.ts 一处。pattern 跟着实现走：
            // 旧版钉的是手写 `normalized / 10000`，那份算式删掉后门禁会空转成红（它验的是「不空转」）
            pattern: /notation: "compact"/,
            allowed: ["packages/common/src/domain/count.ts"],
        },
        剪贴板写入: {
            pattern: /navigator\.clipboard\.writeText/,
            allowed: ["packages/app-kit/src/display/copy-text.ts"],
        },
        // —— 字段规则：形状与提示语各只有一份，owner 就是那条规则在前端的出口
        // 下面两条是**空 allowed**：形状已由契约承载（`@shop/api/schemas` 的 `AddressRequest.phone` /
        // `SmsCodeRequest.phone`，从后端 `@Pattern` 生成），所以前端**任何**文件都不许再出现该字面量。
        // 它们没有「剥完注释仍命中」的 owner 可验——owner 就是生成物本身，而 `packages/api/src`
        // 不在本文件的 SOURCE_ROOTS 里；那半条由上面那条「命中必须是 0 处」等价承担。
        手机号形状: {
            pattern: /1\[3-9\]\\d\{9\}/,
            allowed: [],
        },
        联系电话形状: {
            // `.{5}` 盖的是 `+\\-]` 那几个字符：这里要挡的是「同一条形状被抄第二遍」。
            pattern: /\[0-9.{5}\{5,20\}/,
            allowed: [],
        },
        // 六位数字形状（区划码 / 邮编）同样已由契约承载（`AddressRequest.regionCode` 与
        // `MerchantAddressRequest.postalCode` 都是后端 `@Pattern("^\\d{6}$")` 生成的那一格），
        // 前端任何文件不许再写。邮编那条曾由 seller 表单拿 `POSTAL_CODE_MAX` 现拼一遍
        // （`^\d{6}$`），2026-10 改成读契约那一格后才收进这条。
        // `\\{1,2}` 是「一到两个反斜杠」：正则字面量写 `\d{6}`、字符串里写 `\\d{6}`，两种都要挡。
        六位数字形状: {
            pattern: /\\{1,2}d\{6\}/,
            allowed: [],
        },
        // 商品标题/卖点那句文案不在列：它们已从前端摘掉（同券名那条），schema 只给
        // `validation.{REQUIRED,MIN_LENGTH,MAX_LENGTH}` 这个 key 与 `{min}`/`{max}` 槽位，
        // 句子由 catalog 按界面语言出。「反向不许抄回中文」由 FieldRuleVocabularyTest 那条负向断言守着，
        // 标题上限直接取生成契约；卖点区间仍由 JAVA_TWINS 与后端正则核对。
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
        // 规格那一档的两个数各自有人用才算 owner：编辑器停在 20 个取值、输入框卡 64 字，
        // 只在包导出里挂个名字而没人引用，就还是一份「看着对称」的死码。
        ["SPEC_VALUES_MAX", "packages/common/src/domain/product-fields.ts"],
        ["SPEC_VALUE_MAX", "packages/common/src/domain/product-fields.ts"],
        // 标题与卖点没有「文案常量」这一层了：句子在 catalog，schema 就是那条规则的唯一出口。
        ["AddressPhoneSchema", "packages/common/src/domain/address.ts"],
        ["ADDRESS_LABEL_MAX", "packages/common/src/domain/address.ts"],
        ["CUSTOM_LABEL_MAX", "apps/web/src/address/address-form.ts"],
        // 错误码在前端只有一个出口：这份表。裸字符串比 code 等于给自己发通行证（拼错不报错，
        // 只是那条分支永不命中），所以 owner 有无人用也要钉住——三边相等由后端
        // ErrorCodeVocabularyTest 管，这一条只管「前端别再造第二份」。
        ["ErrorCodes", "packages/common/src/contract/error-codes.ts"],
        // 客户端本地失败（断网 / 超时 / 取消 / 响应不合契约）与上面那份服务端词表分家，
        // 理由见 client-failure.ts 文件头；同样只许有这一个出口
        ["ClientFailureCodes", "packages/common/src/contract/client-failure.ts"],
        ["RESPONSE_VALIDATION_FAILED", "packages/common/src/contract/api-error.ts"],
        // 「这句话该由谁出」只有一个出口：app-kit 的 errorText（§7.3 那条链）。各区块自己判一次必然
        // 漂移——写成 `toApiError(err).detail || 站点文案` 的，站点那句永远轮不上；
        // 而直接读 detail 的，英文界面就漏中文（曾经那条路叫 apiErrorDetail，已收进这条链）
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
    // 字符类、`\d` 与单个字面字符都定长贡献一位。字面字符后面若真跟了量词（`1{2}`），
    // 下一轮会从 spanOf 顶上的正则里「认不出的正则构造」抛出去。
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
 * 定长/区间正则的字符数：只认本仓库这几条形状用得上的构造（`\d` / 字符类，可选 `{m}` `{m,n}`，
 * 以及单个字面或转义字符）。遇到别的构造（分组、或、量词 `*+?`）直接抛——
 * 返回 undefined 会让这条门禁在形状变复杂后**悄悄失效**，那正是本文件要挡的东西。
 * 循环体本身只有「取一个原子」一件事，复杂度集中在 atomSpan / quantBounds 里。
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

    // 验证码位数（SMS_CODE_DIGITS）不在此列：那条形状是由它自己拼出来的（`^\\d{${…}}$`），
    // 两边不可能各说一半，重复断言只会多一条会一起红的空话。
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

/**
 * `function 名字(...): 契约类型 {` 且函数体直接 `return {` 从零列字段 ——  `{ ...别的夹具() }`
 * 那种「换个名字复用」的不算，它要的正是继承而不是重建。
 */
const REBUILT_FIXTURE =
    /^function\s+\w+\([^)]*\)\s*:\s*([A-Z]\w*)\s*\{\s*\n?\s*return\s*\{(?!\s*\.)/gm

describe("契约夹具只搭一次", () => {
    /**
     * 同一个契约响应在两个测试文件里各搭一遍 = 两份默认值会各漂各的：一处补了新字段、
     * 另一处没有，MSW 那边的 zod 校验只会先红一个文件，看着像「那个文件的用例坏了」。
     * 判据是「从零搭完整字面量」，所以 `return makeCoupon({...})` 这种传自己 id 的 wrapper
     * 不算重复——那正是这条规则要求的样子。
     */
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
