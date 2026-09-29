import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@shop/common"

import {
    initialLocaleOf,
    readCookie,
    readPreferredLocale,
    writeCookie,
    writeLocaleCookie,
} from "./locale"

/**
 * Locale 的浏览器管道（原来住在 provider.tsx，只能渲染 Provider 才碰得到）。
 * 这里测的是三件「错了也不会报错」的事：cookie 到底读到没有、写出去那条属性串长什么样、
 * 以及没有已存偏好时到底往下走哪一级。
 */

/** navigator.language 是 Navigator.prototype 上的 getter：挂一个同名的自有 getter 遮住它，用完删掉 */
function stubNavigatorLanguage(language: string) {
    Object.defineProperty(window.navigator, "language", {
        configurable: true,
        get: () => language,
    })
}

function clearCookies() {
    for (const row of document.cookie.split("; ")) {
        const name = row.split("=")[0]
        if (name) document.cookie = `${name}=; path=/; max-age=0`
    }
}

/**
 * 拦下 document.cookie 的写入取证：path / max-age / SameSite 这些属性从 getter 里读不回来
 * （jsdom 和浏览器一样只回 name=value），想钉住「写出去的那句话」只能截 setter。
 */
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
    Reflect.deleteProperty(window.navigator, "language")
})

describe("readCookie", () => {
    it("没有这条 cookie：给 undefined，不替调用方猜一个语言", () => {
        expect(readCookie("locale")).toBeUndefined()
    })

    it("写进去再读回来：按 encodeURIComponent 存的那份被还原成原值", () => {
        document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent("zh-CN")}; path=/`

        expect(readCookie(LOCALE_COOKIE_NAME)).toBe("zh-CN")
    })

    it("按 name= 划边界：locale 不会把 locale_backup 的值当成自己的", () => {
        document.cookie = "locale_backup=en-US; path=/"

        expect(readCookie("locale")).toBeUndefined()

        document.cookie = `${LOCALE_COOKIE_NAME}=en-US; path=/`
        expect(readCookie("locale")).toBe("en-US")
    })

    it("cookie 值是残缺的百分号转义：现状是直接抛 URIError，readCookie 不兜底", () => {
        // 钉的是现状，不是认同它。人为改写过 cookie（或别的写入方没做编码）时
        // decodeURIComponent 就抛，而 Provider 的挂载 effect 会跟着一起炸。
        // 要改成「解析不了就当没存过」是一次行为变更，先留在这里，别悄悄改断言。
        document.cookie = "broken=%E4%B8; path=/"

        expect(() => readCookie("broken")).toThrow(URIError)
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

describe("initialLocaleOf", () => {
    it("装配侧给了 initialLocale 就照它渲染，不掺任何猜测", () => {
        expect(initialLocaleOf("en-US")).toBe("en-US")
    })

    it("没给 initialLocale 只退到平台默认——这里已没有「进程当前语言」可退（§3.5）", () => {
        expect(initialLocaleOf()).toBe(DEFAULT_LOCALE)
        expect(initialLocaleOf(undefined)).toBe(DEFAULT_LOCALE)
    })
})

describe("readPreferredLocale 的回落顺序", () => {
    it("已存的 cookie 赢过浏览器语言", () => {
        stubNavigatorLanguage("en-US")
        document.cookie = `${LOCALE_COOKIE_NAME}=zh-CN; path=/`

        expect(readPreferredLocale()).toBe("zh-CN")
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

        expect(readPreferredLocale()).toBe("zh-CN")
    })
})
