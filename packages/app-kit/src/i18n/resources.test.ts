import type { AppLocale } from "@shop/common/i18n"
import { describe, expect, it } from "vite-plus/test"

import { APP_KIT_MESSAGES } from "./messages"
import { assembleLocaleResources } from "./resources"

/**
 * 资源装配。它管的不是「能不能取到文案」，而是两种**不报错**的失效：
 * 语言目录名打错 → 整个文件等于不存在；同一语言里跨 namespace 撞 key → 静默覆盖。
 * 拆成多文件之后这两个坑的概率都上来了，所以装配函数把它们变成抛。
 */

function keysOf(locale: AppLocale): string[] {
    return Object.keys(APP_KIT_MESSAGES[locale] ?? {}).toSorted()
}

describe("assembleLocaleResources", () => {
    it("同一语言的多个 namespace 汇成一份 catalog，key 谁给的记谁", () => {
        const resources = assembleLocaleResources({
            "./zh-CN/order.json": { "order.paid": "已支付" },
            "./zh-CN/common.json": { "common.cancel": "取消" },
        })

        expect(resources["zh-CN"]).toEqual({
            "order.paid": "已支付",
            "common.cancel": "取消",
        })
    })

    it("只取倒数第二段当语言：带前缀的 ../locales/en-US/appKit.json 也认", () => {
        const resources = assembleLocaleResources({
            "../locales/en-US/appKit.json": { "appKit.login.submit": "Sign in" },
            "../locales/zh-CN/appKit.json": { "appKit.login.submit": "登录" },
        })

        expect(resources["en-US"]?.["appKit.login.submit"]).toBe("Sign in")
        expect(resources["zh-CN"]?.["appKit.login.submit"]).toBe("登录")
    })

    it("语言目录名打错当场抛：不然那份文件是静默缺席", () => {
        expect(() =>
            assembleLocaleResources({ "./zh_CN/order.json": { "order.paid": "已支付" } }),
        ).toThrow(/zh_CN\/order\.json/)
    })

    it("同一语言内撞 key 当场抛，并把两处都指名", () => {
        expect(() =>
            assembleLocaleResources({
                "./zh-CN/order.json": { "common.cancel": "订单里的取消" },
                "./zh-CN/common.json": { "common.cancel": "通用取消" },
            }),
        ).toThrow(/common\.cancel/)
    })

    it("不同语言用同一个 key 不算撞车", () => {
        expect(() =>
            assembleLocaleResources({
                "./zh-CN/order.json": { "order.paid": "已支付" },
                "./en-US/order.json": { "order.paid": "Paid" },
            }),
        ).not.toThrow()
    })
})

describe("APP_KIT_MESSAGES", () => {
    it("两种语言的 key 集合一致（平齐检查的正主是 §9 的 codegen，这里先钉住刚拆出来的那份）", () => {
        expect(keysOf("en-US")).toEqual(keysOf("zh-CN"))
    })
})
