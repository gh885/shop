import { describe, expect, it } from "vite-plus/test"

import { normalizeLocale, resolveLocale } from "./locale"

describe("normalizeLocale", () => {
    it("normalizes common Chinese aliases", () => {
        expect(normalizeLocale("zh")).toBe("zh-CN")
        expect(normalizeLocale("zh-Hans")).toBe("zh-CN")
        expect(normalizeLocale("zh_CN")).toBe("zh-CN")
    })

    it("normalizes common English aliases", () => {
        expect(normalizeLocale("en")).toBe("en-US")
        expect(normalizeLocale("en-GB")).toBe("en-US")
        expect(normalizeLocale("en-AU")).toBe("en-US")
        expect(normalizeLocale("en-US")).toBe("en-US")
        expect(normalizeLocale("en_Latn_US")).toBe("en-US")
    })

    it("returns null for unsupported locales", () => {
        expect(normalizeLocale("ja-JP")).toBeNull()
        expect(normalizeLocale("")).toBeNull()
        expect(normalizeLocale(null)).toBeNull()
    })
})

describe("resolveLocale", () => {
    it("picks the first supported candidate", () => {
        expect(resolveLocale(["ja-JP", "en-US", "zh-CN"])).toBe("en-US")
    })

    it("parses Accept-Language quality order", () => {
        expect(resolveLocale(["zh-CN;q=0.8,en-US;q=0.9"])).toBe("en-US")
    })

    it("ignores excluded and malformed quality values", () => {
        expect(resolveLocale(["en-US;q=0"])).toBe("zh-CN")
        expect(resolveLocale(["en-US;q=2,zh-CN;q=0.5"])).toBe("zh-CN")
        expect(resolveLocale(["en-US;q=0.9oops"])).toBe("zh-CN")
    })

    it("falls back to zh-CN when no candidate is supported", () => {
        expect(resolveLocale(["ja-JP", "ko-KR"])).toBe("zh-CN")
    })
})
