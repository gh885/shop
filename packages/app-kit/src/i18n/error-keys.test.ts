import { type ApiError, ErrorCodes, resolveMessage } from "@shop/common"
import { describe, expect, it } from "vite-plus/test"

import { DETAIL_FIRST_CODES, errorKeyFor, errorTextPlan } from "./error-keys"
import { APP_KIT_MESSAGES } from "./messages"

/**
 * §7.3「后端出 code，前端出文案」这一串的可执行面。
 *
 * 编译期那半由 `error-keys.ts` 的 `satisfies Record<code 值, AppKitMessageKey>` 给（加了码忘了
 * 配文案 = 编译不过）；这里补的是编译期看不见的两件：catalog 里那两句**取得到**（装配没漏语言
 * 目录），以及迁移期那两条例外**还成立**——它们的 catalog 句子一旦带上 `{slot}`，说明参数化
 * 已经落地，就该从清单里删掉，此时这里的断言必然红。
 *
 * 逐码一个用例（`it.each`）而不是一个循环用例：失败时用例名就带着是哪个码，
 * 不用在几百次断言里反推是哪条路走岔了。
 */
const LOCALES = ["zh-CN", "en-US"] as const

const ALL_CODES = Object.values(ErrorCodes)
const CATALOG_CODES = ALL_CODES.filter((code) => !DETAIL_FIRST_CODES.includes(code))

describe("error.<code> catalog", () => {
    it.each(CATALOG_CODES)("%s：中英文都取得到 catalog 句子", (code) => {
        expect(errorKeyFor(code)).toBe(`error.${code}`)
        for (const locale of LOCALES) {
            const text = resolveMessage(APP_KIT_MESSAGES, `error.${code}`, locale)
            expect(text).toBeTruthy()
            expect(text).not.toBe(`error.${code}`)
        }
    })

    it("迁移期例外清单是这两条，多一条少一条都红", () => {
        expect(DETAIL_FIRST_CODES).toEqual([
            "ADDRESS_LIMIT_EXCEEDED",
            "MERCHANT_ADDRESS_LIMIT_EXCEEDED",
        ])
    })

    /**
     * COM-01 的参数通道落地后，违禁词退出例外清单：命中的字段与词由 `errors[].field/value` 带出来，
     * 那句要参数化的话是卖家端的 `product.publish.forbiddenWordHit`（见 seller 的 forbidden-word 测试），
     * 这里只剩「这个码有可以直接给用户看的 catalog 文案」这一格要守住。
     */
    it("FORBIDDEN_WORD_HIT：detail 不再优先，两种语言都取 catalog", () => {
        expect(errorKeyFor("FORBIDDEN_WORD_HIT")).toBe("error.FORBIDDEN_WORD_HIT")
        for (const locale of LOCALES) {
            const plan = errorTextPlan(
                apiError({ code: "FORBIDDEN_WORD_HIT", detail: "「标题」包含违禁词「最佳」" }),
                locale,
            )
            expect(plan.source).toBe("catalog")
            expect(plan.text).toBe(
                resolveMessage(APP_KIT_MESSAGES, "error.FORBIDDEN_WORD_HIT", locale),
            )
        }
        // 汉字那一格只问英文界面：中文界面 catalog 那句本身就是中文，条件里写 expect 会被
        // no-conditional-expect 拦，而它在这条规则上是对的——分支里的断言只在半个矩阵上跑
        expect(
            hasCjk(
                errorTextPlan(
                    apiError({ code: "FORBIDDEN_WORD_HIT", detail: "「标题」包含违禁词「最佳」" }),
                    "en-US",
                ).text,
            ),
        ).toBe(false)
    })

    it.each(DETAIL_FIRST_CODES)(
        "%s：catalog 那句确实还没参数化（参数化落地就该从例外清单里删）",
        (code) => {
            expect(errorKeyFor(code)).toBeUndefined()
            for (const locale of LOCALES) {
                const text = resolveMessage(APP_KIT_MESSAGES, `error.${code}`, locale)
                expect(text).toBeTruthy()
                // 长出 `{` 就是参数化已落地却不删这条例外——兜底会长成永久架构，所以当场红
                expect(text).not.toContain("{")
            }
        },
    )

    it("词表之外的码不猜文案", () => {
        expect(errorKeyFor("NOT_A_CODE")).toBeUndefined()
        expect(errorKeyFor(undefined)).toBeUndefined()
    })
})

/** 后端 detail 的语种是中文（`DETAIL_LOCALE`），所以界面里出现汉字就等于漏语种 */
const hasCjk = (text: string) => /[一-鿿]/.test(text)

const apiError = (over: Partial<ApiError>): ApiError => ({
    status: 400,
    detail: "后端那句中文说明",
    ...over,
})

/**
 * `errorTextPlan` 的分支（§7.3 兜底链的后半）。这里钉的是**语言**这件事：
 * 后端 267 个报错出口不带 code（普查与口径见 docs/error-codes.md），拿不到 code 时该说什么，
 * 是唯一一条「英文界面不许出现汉字」的路径能守得住的写法。
 */
describe("errorTextPlan 按 locale 决定 detail 能不能当文案", () => {
    it("登记码：两种语言都取 catalog，后端那句中文进不了界面", () => {
        for (const locale of LOCALES) {
            const plan = errorTextPlan(apiError({ code: "SMS_CODE_INVALID" }), locale)
            expect(plan.source).toBe("catalog")
            expect(plan.text).toBe(
                resolveMessage(APP_KIT_MESSAGES, "error.SMS_CODE_INVALID", locale),
            )
        }
    })

    it("detail 只在中文界面当文案", () => {
        expect(errorTextPlan(apiError({}), "zh-CN")).toEqual({
            source: "detail",
            text: "后端那句中文说明",
        })
        const en = errorTextPlan(apiError({}), "en-US")
        expect(en.source).toBe("status")
        expect(en.text).toBe(resolveMessage(APP_KIT_MESSAGES, "appKit.error.badRequest", "en-US"))
    })

    it.each([
        [400, "appKit.error.badRequest"],
        [401, "appKit.error.unauthorized"],
        [403, "appKit.error.forbidden"],
        [404, "appKit.error.notFound"],
        [409, "appKit.error.conflict"],
        [422, "appKit.error.validation"],
        [429, "appKit.error.rateLimited"],
        [500, "appKit.error.serverError"],
        [503, "appKit.error.serverError"],
        // 没列进来的状态码不许回退成空句或 key 本身
        [418, "appKit.error.network"],
    ])("英文界面 %s → %s", (status, key) => {
        const plan = errorTextPlan(apiError({ status }), "en-US")
        expect(plan.source).toBe("status")
        expect(plan.text).toBe(resolveMessage(APP_KIT_MESSAGES, key, "en-US"))
        expect(hasCjk(plan.text)).toBe(false)
    })

    it("调用方场景文案盖过通用句（区块就地报错比通用话具体）", () => {
        const en = errorTextPlan(apiError({ status: 500 }), "en-US", "Feed failed to load")
        expect(en.source).toBe("fallback")
        expect(en.text).toBe("Feed failed to load")
    })

    it("后端没说话（status 0）：场景文案，没给则通用网络句", () => {
        expect(errorTextPlan(apiError({ status: 0, detail: "" }), "en-US").text).toBe(
            resolveMessage(APP_KIT_MESSAGES, "appKit.error.network", "en-US"),
        )
        expect(errorTextPlan(apiError({ status: 0, detail: "" }), "en-US", "offline").text).toBe(
            "offline",
        )
    })

    it.each(DETAIL_FIRST_CODES)(
        "%s：非中文界面退成 catalog 那句占位，中文界面保留具体 detail",
        (code) => {
            const en = errorTextPlan(
                apiError({ code, detail: "「标题」包含违禁词「最佳」" }),
                "en-US",
            )
            expect(en.source).toBe("catalog")
            expect(en.text).toBe(resolveMessage(APP_KIT_MESSAGES, `error.${code}`, "en-US"))
            expect(hasCjk(en.text)).toBe(false)
            expect(
                errorTextPlan(apiError({ code, detail: "最多保存 20 条收货地址" }), "zh-CN"),
            ).toEqual({
                source: "detail",
                text: "最多保存 20 条收货地址",
            })
        },
    )

    it("词表里查不到的码也不猜句子——按状态码兜底", () => {
        const plan = errorTextPlan(apiError({ code: "NOT_A_CODE", status: 409 }), "en-US")
        expect(plan.source).toBe("status")
        expect(plan.text).toBe(resolveMessage(APP_KIT_MESSAGES, "appKit.error.conflict", "en-US"))
    })
})
