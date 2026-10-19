import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import type { ProductDetail, SkuSelection } from "../rules"

export type SkuSearch = {
    spec?: SkuSelection
}

export type SkuSearchInput = SearchSchemaInput & {
    spec?: SkuSelection
}

/**
 * 校验并兜脏值：`spec` 必须是「字符串 → 字符串」的记录，任何不合法输入（含 spec 整体缺失）
 * 一律收敛为「没有 spec」。与结算页 `lines.catch([])` 同一策略 —— 脏 URL 不该 500，
 * 该退化成「未选规格」这个合法初态。
 *
 * ## 为什么兜底值是 `undefined` 而不是 `{}`（这一条是性能决定，改前先读完）
 *
 * 兜底成 `{}` 时，**裸链 `/products/<id>` 会多一跳 307**，被重定向到 `/products/<id>?spec=%7B%7D`。
 * 机理在 TanStack Router 的 search 中间件里：`validateSearch` 的输出里凡是「输入 URL 里没有的键」
 * 都会被记进 `meta.defaulted`（router-core 的 `applySearchMiddleware`），随后被写回 search，
 * 于是规范化后的 search 与真实 URL 不一致，路由就 commit 一次 replace —— 冷访问时表现为 307。
 * 商品卡、推荐流、搜索结果里全是裸链，所以这一跳是**首屏必经之路**，在 Lighthouse 的
 * mobile 档实测约 600ms（模拟档单请求往返就是 562ms 延迟），商详 LCP 因此多出这一整跳。
 *
 * 兜底成 `undefined`（并由上面的 transform 把键整个去掉）时 `meta.defaulted` 为空，
 * URL 与 search 一致，不重定向；脏值仍然退化成「未选规格」，行为与兜底 `{}` 完全一样。
 * **代价只有一处**：读的地方要写 `search.spec ?? {}`（本仓库只有详情页 route 一处）。
 */
export const skuSearchSchema = z
    .object({
        // oxlint-disable-next-line unicorn/prefer-top-level-await -- 这是 zod 的 .catch(兜底值)，不是 Promise.catch
        spec: z.record(z.string(), z.string()).optional().catch(undefined),
    })
    // 兜底值光是 undefined 还不够：那样输出里仍**存在** `spec` 这个键（值为 undefined），
    // 而 router 的 `for (const key in validated)` 会照样枚举到它、照样记进 meta.defaulted。
    // 这里显式把「没选规格」两种形状收敛成一种：键彻底不存在。
    .transform(({ spec }) => (spec === undefined ? {} : { spec }))

export function sanitizeSelection(detail: ProductDetail, spec: SkuSelection): SkuSelection {
    const next: SkuSelection = {}
    for (const group of detail.specs) {
        const value = spec[group.name]
        if (value === undefined) continue
        if (group.values.some((v) => v.value === value)) next[group.name] = value
    }
    return next
}

export function toggleSelection(
    selection: SkuSelection,
    specName: string,
    value: string,
): SkuSelection {
    const next = { ...selection }
    if (next[specName] === value) delete next[specName]
    else next[specName] = value
    return next
}

export function sameSelection(a: SkuSelection, b: SkuSelection): boolean {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((k) => a[k] === b[k])
}
