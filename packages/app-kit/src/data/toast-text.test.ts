import { messageFactFactory } from "@shop/i18n"
import { createAppI18n } from "../i18n/runtime"
import { describe, expect, it } from "vite-plus/test"

import type { I18nResources } from "@shop/i18n"

import { resolveToastText } from "./toast-text"

/** 构造后仍按当前实例翻译；资源缺失或模板损坏时安全降级为 key。 */

const MESSAGES: I18nResources = {
    "zh-Hans-CN": {
        "test.saved": "已保存",
        "test.savedWith": "已保存{label}",
        "test.bad": "{oops",
    },
    "en-US": { "test.saved": "Saved", "test.savedWith": "Saved {label}" },
}

describe("resolveToastText", () => {
    it("key 命中 catalog 并插值 params", () => {
        expect(
            resolveToastText(
                message("test.savedWith", { label: "地址" }),
                createAppI18n("zh-Hans-CN", MESSAGES),
            ),
        ).toBe("已保存地址")
        expect(resolveToastText(message("test.saved"), createAppI18n("en-US", MESSAGES))).toBe(
            "Saved",
        )
    })

    it("资源版本不一致导致 key 缺失时，回退 key 而不抛异常", () => {
        expect(
            resolveToastText(message("test.not-here"), createAppI18n("zh-Hans-CN", MESSAGES)),
        ).toBe("test.not-here")
    })

    it("坏 ICU 模板降级成 key，不抛（t() 同步返回、白屏防线）", () => {
        expect(resolveToastText(message("test.bad"), createAppI18n("zh-Hans-CN", MESSAGES))).toBe(
            "test.bad",
        )
    })
})

type FixtureKey = "test.saved" | "test.savedWith" | "test.bad" | "test.not-here"
const message = messageFactFactory<FixtureKey, { "test.savedWith": { label: string } }>()
