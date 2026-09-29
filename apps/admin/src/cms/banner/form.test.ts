import { describe, expect, it, vi } from "vite-plus/test"

import type { BannerResponse } from "@shop/api/sdk"

import { bannerDefaults, toBannerRequest } from "./form"

/**
 * banner 表单值 → BannerRequest。
 *
 * 表单里全是字符串（输入框只能装字符串），契约要的是 number | undefined 与 ISO。
 * 这道「什么时候算填了、什么时候算没填」的判据就是这里一次投影，写错了后端会收到
 * 一个它没法解释的值。
 *
 * 档期回填按本地墙上时钟显示，故把时区钉成 Asia/Shanghai 再断言字面量（同 constants.test.ts）——
 * 不钉的话同一个时刻在 UTC 机器与 +08 机器上会渲染出两个不同的输入框值。
 */
vi.stubEnv("TZ", "Asia/Shanghai")

function makeBanner(overrides: Partial<BannerResponse> = {}): BannerResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        slot: "home_promo",
        title: "新春大促",
        subtitle: "满 199 减 100",
        imageUrl: "https://img.test/banner.png",
        targetType: "PRODUCT",
        target: "12345",
        link: null,
        status: "ENABLED",
        sortOrder: 3,
        startAt: null,
        endAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        ...overrides,
    }
}

const blankForm = () => ({
    slot: "home_promo",
    title: "新春大促",
    subtitle: undefined,
    imageUrl: "https://img.test/banner.png",
    targetType: "NONE" as const,
    target: "",
    link: "",
    sortOrder: "",
    startAt: "",
    endAt: "",
})

describe("bannerDefaults", () => {
    // 「新建带哪个运营位」不单列一条：上面那条 toMatchObject 已经断言 slot 落在 home_promo
    it("新建：没编辑过的档期留空串，不预填一个时刻（预填等于替运营做了决定）", () => {
        const values = bannerDefaults(undefined, "home_promo")

        expect(values).toMatchObject({
            slot: "home_promo",
            startAt: "",
            endAt: "",
            sortOrder: "0",
        })
    })

    it("编辑：响应里的 ISO 档期回填成本地墙上时钟，而不是 UTC 时刻", () => {
        const values = bannerDefaults(makeBanner({ startAt: "2026-08-15T01:00:00Z" }))

        expect(values.startAt).toBe("2026-08-15T09:00")
        expect(values.endAt).toBe("")
    })

    it("编辑：脏的 targetType 落回 NONE，而不是让下拉框显示一个空选项", () => {
        expect(bannerDefaults(makeBanner({ targetType: "MINI_PROGRAM" })).targetType).toBe("NONE")
    })
})

describe("toBannerRequest", () => {
    it("只填必填项：可选字段发缺省而不是空串，排序的空串按 0 解释", () => {
        expect(toBannerRequest(blankForm())).toMatchObject({
            slot: "home_promo",
            title: "新春大促",
            imageUrl: "https://img.test/banner.png",
            sortOrder: 0,
        })
    })

    it("首尾空白不进请求：标题带空格会在前台原样显示出来", () => {
        const values = {
            ...blankForm(),
            title: "  新春大促  ",
            imageUrl: " https://img.test/a.png ",
        }

        expect(toBannerRequest(values)).toMatchObject({
            title: "新春大促",
            imageUrl: "https://img.test/a.png",
        })
    })

    it("选了跳转类型才带 target：光有 target 没有类型，前端拿到也不知道跳哪", () => {
        const values = { ...blankForm(), targetType: "PRODUCT" as const, target: "12345" }

        expect(toBannerRequest(values)).toMatchObject({ targetType: "PRODUCT", target: "12345" })
    })

    it("「不跳转」提交时是缺省而不是字符串 NONE：三个表单同一口径", () => {
        expect(toBannerRequest(blankForm()).targetType).toBeUndefined()
    })
})
