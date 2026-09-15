import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import type { ProductDetail, SkuSelection } from "../product"

/**
 * 商品详情的 URL 查询参数 —— 规格选择进 URL 之后，它就是选中态的**唯一真源**。
 *
 * ## 为什么进 URL 而不是 useState
 * - 刷新、后退、分享链接都不丢规格；「复制链接」能把选好的规格一起带给别人
 * - 与结算页 `CheckoutSource` 同一套机制（`validateSearch` + zod + `Route.useSearch()`），
 *   两个入口的地址栏语义一致：URL 里写的就是用户看到的
 *
 * ## 为什么 URL 里只放规格、不放推导出的 skuId
 * `findMatchingSku` 是确定性纯函数，skuId 完全可以由规格推出来。多存一份派生值就要多维护一次
 * 一致性（派生值与来源对不上时得写"修复 URL"的副作用）。**单一真源 = 不存在需要修复的派生值。**
 */

/** 详情页 search：目前只有规格选择。形状与 SkuSelection 同构（维度名 → 值） */
export type SkuSearch = {
    spec: SkuSelection
}

/**
 * `validateSearch` 的**入参**类型，带 `SearchSchemaInput` 标记。
 *
 * 标记的作用：路由据此认定「链接 / 编程式导航到详情页时可以不带 search」，于是
 * `<Link to="/products/$id">` 不需要写 `search={{ spec: {} }}`——商品卡片、推荐流、搜索结果
 * 到处都要跳详情页，逐个补一个空 spec 既无意义又容易漏。
 * 不标记的话，路由会拿 `validateSearch` 的**返回**类型（spec 必需）去要求所有链接。
 */
export type SkuSearchInput = SearchSchemaInput & {
    spec?: SkuSelection
}

/**
 * 校验并兜脏值：`spec` 必须是「字符串 → 字符串」的记录，任何不合法输入（含 spec 整体缺失）
 * 一律收敛为 `{}`。与结算页 `lines.catch([])` 同一策略 —— 脏 URL 不该 500，
 * 该退化成「未选规格」这个合法初态。
 */
export const skuSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 这是 zod 的 .catch(兜底值)，不是 Promise.catch
    spec: z.record(z.string(), z.string()).catch({}),
})

/**
 * 把 URL 里的规格收窄到商品**当前真实存在**的维度与值。
 *
 * **为什么必须收窄**：`findMatchingSku` / `isValueAvailable` 要求选择里**每个**维度都能在 SKU 的
 * attributes 上命中。URL 里只要残留一个已下架的维度或值，全部 SKU 就都匹配不上 ——
 * 表现是规格全灰、价格永远停在区间价，而用户完全看不出原因。老链接、卖家改规格后的旧 URL
 * 都会走到这条路径。
 *
 * 判据取 `detail.specs` 而非 `detail.skus`：只有 specs 里声明过的维度才渲染得出选择器，
 * 用户根本选不出来的维度就不该参与匹配。
 */
export function sanitizeSelection(detail: ProductDetail, spec: SkuSelection): SkuSelection {
    const next: SkuSelection = {}
    for (const group of detail.specs) {
        const value = spec[group.name]
        if (value === undefined) continue
        if (group.values.some((v) => v.value === value)) next[group.name] = value
    }
    return next
}

/** 点选某维度的值：同值再点一次 = 取消该维度（回到「未选」，价格退回区间价） */
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

/** 两份选择是否等价（维度集合与取值都相同）。URL 与收窄结果比对用，不看键序 */
export function sameSelection(a: SkuSelection, b: SkuSelection): boolean {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((k) => a[k] === b[k])
}
