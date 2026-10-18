import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@shop/i18n"
import {
    pickHydrationLocale,
    readCookie,
    readPreferredLocale,
    writeCookie,
    writeLocaleCookie,
} from "./locale"

/** Locale 的浏览器管道（原住 provider.tsx）：测三件「错了也不报错」的事——cookie 读到没、写出的属性串长啥样、没偏好时往哪级回落 */

/** navigator.languages 是 Navigator.prototype 上的 getter：挂一个同名的自有 getter 遮住它，用完删掉 */
function stubNavigatorLanguage(language: string) {
    Object.defineProperty(window.navigator, "languages", {
        configurable: true,
        get: () => (language ? [language] : []),
    })
}

function clearCookies() {
    for (const row of document.cookie.split("; ")) {
        const name = row.split("=")[0]
        if (name) document.cookie = `${name}=; path=/; max-age=0`
    }
}

/** cookie 属性（path/max-age/SameSite）从 getter 读不回来（jsdom 和浏览器一样只回 name=value），要钉写出去那句只能截 setter */
function captureCookieWrites(write: () => void): string[] {
    const written: string[] = []
    Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => "",
        set: (value: string) => {
            written.push(value)
        },
    })
    try {
        write()
    } finally {
        Reflect.deleteProperty(document, "cookie")
    }
    return written
}

beforeEach(() => {
    clearCookies()
})

afterEach(() => {
    clearCookies()
    Reflect.deleteProperty(window.navigator, "languages")
})

describe("readCookie", () => {
    it("没有这条 cookie：给 undefined，不替调用方猜一个语言", () => {
        expect(readCookie("locale")).toBeUndefined()
    })

    it("写进去再读回来：按 encodeURIComponent 存的那份被还原成原值", () => {
        document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent("zh-Hans-CN")}; path=/`

        expect(readCookie(LOCALE_COOKIE_NAME)).toBe("zh-Hans-CN")
    })

    it("按 name= 划边界：locale 不会把 locale_backup 的值当成自己的", () => {
        document.cookie = "locale_backup=en-US; path=/"

        expect(readCookie("locale")).toBeUndefined()

        document.cookie = `${LOCALE_COOKIE_NAME}=en-US; path=/`
        expect(readCookie("locale")).toBe("en-US")
    })

    it("残缺的 cookie 转义当作未设置，不阻断应用初始化", () => {
        document.cookie = "broken=%E4%B8; path=/"
        expect(readCookie("broken")).toBeUndefined()
    })
})

describe("writeCookie", () => {
    it("写出去的那条属性串：path=/ + 一年 max-age + SameSite=Lax，一个字符都不许漂", () => {
        const written = captureCookieWrites(() => writeCookie("locale", "en-US"))

        expect(written).toEqual(["locale=en-US; path=/; max-age=31536000; SameSite=Lax"])
    })

    it("值按 encodeURIComponent 写：带空格的值不会把 cookie 属性串截断", () => {
        const written = captureCookieWrites(() => writeCookie("locale", "zh CN"))

        expect(written[0]).toContain("locale=zh%20CN;")
    })

    it("writeLocaleCookie 落在 LOCALE_COOKIE_NAME 那一格，读写两头同名", () => {
        writeLocaleCookie("en-US")

        expect(readCookie(LOCALE_COOKIE_NAME)).toBe("en-US")
    })
})

describe("readPreferredLocale 的回落顺序", () => {
    it("已存的 cookie 赢过浏览器语言", () => {
        stubNavigatorLanguage("en-US")
        document.cookie = `${LOCALE_COOKIE_NAME}=zh-Hans-CN; path=/`

        expect(readPreferredLocale()).toBe("zh-Hans-CN")
    })

    it("没有已存的 cookie 时用浏览器语言", () => {
        stubNavigatorLanguage("en-US")

        expect(readPreferredLocale()).toBe("en-US")
    })

    it("cookie 存了个不认的语言，退回浏览器语言而不是把它原样带出去", () => {
        stubNavigatorLanguage("en-US")
        document.cookie = `${LOCALE_COOKIE_NAME}=ja-JP; path=/`

        expect(readPreferredLocale()).toBe("en-US")
    })

    it("三级都落空 → 平台默认 Locale", () => {
        stubNavigatorLanguage("")

        expect(readPreferredLocale()).toBe(DEFAULT_LOCALE)
    })

    it("cookie 里存的是别名写法也归一成 AppLocale（zh_Hans 算中文）", () => {
        stubNavigatorLanguage("")
        document.cookie = `${LOCALE_COOKIE_NAME}=zh_Hans; path=/`

        expect(readPreferredLocale()).toBe("zh-Hans-CN")
    })
})

/** 水合继承：客户端首屏照抄服务端渲染的 <html lang>；缺失/非法返回 undefined，不硬造一个 Locale 传下去 */
describe("pickHydrationLocale", () => {
    const originalLang = document.documentElement.lang
    afterEach(() => {
        document.documentElement.lang = originalLang
    })

    it("lang 是受支持语言时原样取回", () => {
        document.documentElement.lang = "en-US"
        expect(pickHydrationLocale()).toBe("en-US")
    })

    it("lang 缺失或不被支持时返回 undefined", () => {
        document.documentElement.lang = ""
        expect(pickHydrationLocale()).toBeUndefined()
        document.documentElement.lang = "fr-FR"
        expect(pickHydrationLocale()).toBeUndefined()
    })
})
