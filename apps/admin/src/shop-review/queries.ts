import { AdminReviewsApi, ShopReviewStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

/**
 * admin 端审核队列的数据层：queryKey 工厂 + 取数 options（CMS 三域各自的 `queries.ts` 同形态）。
 *
 * 为什么必须集中：key 是失效关系的唯一入口，散落在 api.ts / me.ts / 各路由里时
 * 「谁失效了谁」只存在于写代码的人脑内 —— 新增一个读取方时没人会记得同步失效点。
 * admin 目前只有两棵 key 树，但形态从第一棵树起就该立住。
 *
 * `admin` 前缀是端级隔离：admin 的端点与 C 端不同源（/admin/**），前缀保证两端永不同 key ——
 * 未来若三端共用一个 QueryClient 也不会串缓存。
 */

/** 店铺审核状态（与后端枚举对齐）的 URL search 合法取值：只被下面那份 search schema 读 */
const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

/** 店铺审核队列的 URL search：路由校验、页面、取数共用这一份形状 */
export const reviewSearchSchema = createPaginationSearchSchema(20).extend({
    status: ShopReviewStatusSchema.optional(),
})
export type ReviewSearch = z.infer<typeof reviewSearchSchema>

/** 店铺审核列表：list = 参数化切片，all 一发命中所有 status / 分页（mutation 后的失效入口） */
export const reviewKeys = {
    all: ["admin", "reviews"] as const,
    list: (input: ReviewSearch) => [...reviewKeys.all, input] as const,
} as const

// 错误态重试不再由本文件提供：审核列表失败由全局默认的 throwOnError 抛给路由错误页，
// 重试走官方边界重置。

/**
 * 店铺审核列表：参数即 key 的一部分（status/page/size），请求与 key 同源写在一处。
 * 出参只裁 records/total —— 表格要的就是这两样，PageResult 的其余字段是空转。
 */
export const reviewListOptions = (input: ReviewSearch) =>
    queryOptions({
        queryKey: reviewKeys.list(input),
        queryFn: async () => {
            const page = await AdminReviewsApi.listShopReviews({
                query: {
                    status: input.status,
                    pageParams: { page: input.page, size: input.size },
                },
            })
            return { records: page.records, total: page.total }
        },
        // 服务端分页/筛选时保留上一份数据，避免每次翻页都闪整表加载态
        placeholderData: (prev) => prev,
        // 带 placeholderData（不能走 suspense），失败冒到路由错误页（全局默认的官方判据：
        // 只在「一条数据都没有」时抛，翻页失败不会把已有表格换掉）
    })
