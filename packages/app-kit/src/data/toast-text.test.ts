import { createAppI18n } from "../i18n/runtime"
import { describe, expect, it } from "vite-plus/test"

import type { I18nResources } from "@shop/common/i18n"

import { resolveToastText } from "./toast-text"

/**
 * `resolveToastText` 是 §6.1「存事实、边界换句子」搬到写操作回执上的那一步：
 * meta 只带 key + params，句子到 MutationCache 触发那一刻按 locale 现取。
 * 这几条钉的是它必须守住的边界——漏 key 原样返回、坏模板降级成 key，都不抛、不空、不刷屏上报。
 * 裸串已从 `ToastText` 类型删除（迁移收口），这里的入参一律是 `{ key }`。
 * 「漏 key 不报 i18n_missing_key」是结构性的：本函数不 import captureError，与 translateFieldError 同法。
 */

const MESSAGES: I18nResources = {
    "zh-CN": { "test.saved": "已保存", "test.savedWith": "已保存{label}", "test.bad": "{oops" },
    "en-US": { "test.saved": "Saved", "test.savedWith": "Saved {label}" },
}

describe("resolveToastText", () => {
    it("key 命中 catalog 并插值 params", () => {
        expect(
            resolveToastText(
                { key: "test.savedWith", params: { label: "地址" } },
                createAppI18n("zh-CN", MESSAGES),
            ),
        ).toBe("已保存地址")
        expect(resolveToastText({ key: "test.saved" }, createAppI18n("en-US", MESSAGES))).toBe(
            "Saved",
        )
    })

    it("查不到 key：原样返回那串 key（没迁移的表单中文/成品句都走这条，不刷屏上报）", () => {
        expect(resolveToastText({ key: "test.not-here" }, createAppI18n("zh-CN", MESSAGES))).toBe(
            "test.not-here",
        )
    })

    it("坏 ICU 模板降级成 key，不抛（t() 同步返回、白屏防线）", () => {
        expect(resolveToastText({ key: "test.bad" }, createAppI18n("zh-CN", MESSAGES))).toBe(
            "test.bad",
        )
    })
})
