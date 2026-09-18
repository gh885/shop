import type { ShopReviewStatus } from "@shop/api/sdk"

/**
 * admin 端 queryKey 工厂（与 seller 各域的 `xxxKeys` 同范式）。
 *
 * 为什么必须集中：key 是失效关系的唯一入口，散落在 api.ts / me.ts / 各路由里时
 * 「谁失效了谁」只存在于写代码的人脑内 —— 新增一个读取方时没人会记得同步失效点。
 * admin 目前只有两棵 key 树，但形态从第一棵树起就该立住。
 *
 * `admin` 前缀是端级隔离：admin 的端点与 C 端不同源（/admin/**），前缀保证两端永不同 key ——
 * 未来若三端共用一个 QueryClient 也不会串缓存。
 */

/** 店铺审核列表：list = 参数化切片，all 一发命中所有 status / 分页（mutation 后的失效入口） */
export const reviewKeys = {
    all: ["admin", "reviews"] as const,
    list: (input: { status?: ShopReviewStatus; page: number; size: number }) =>
        ["admin", "reviews", input.status ?? "all", input.page, input.size] as const,
} as const

// 错误态重试不再由本文件提供：审核列表失败由全局默认的 throwOnError 抛给路由错误页，
// 重试走官方边界重置（见 shared/ui/RouteError.tsx）。
