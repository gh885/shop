import type { Money } from "@shop/api/sdk"
import { compactCount } from "@shop/common/domain"
import type { AppLocale } from "@shop/common/i18n" /**
 * favorite 模块 —— 纯逻辑（类型 + 过滤 + 文案），不碰 React / 网络。
 * wire → 投影在 ./mapper.ts。
 * 这不是「收藏的业务规则」（后端裁决），而是类型 + 复用的小派生。
 */

/** 收藏条目业务形状：商品下架 → available=false 由渲染层置灰保留。
 * price 取最低价（卡片只展示一个价）。 */
export type FavoriteItem = {
    /** 收藏行主键（批量删除/跳转按 productId 而非该 id） */
    id: string
    productId: string
    favoritedAt: string
    available: boolean
    /** 商品名；已删除时为空串，失效标题由渲染层 t("web.favorite.deletedProduct") 出（§8） */
    title: string
    /** 商品已被删除（product 为 null）；渲染层据此显示失效文案而非 title，不比对中文文本 */
    deleted: boolean
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    price?: Money
    collectCount: number
}

/** 关键词过滤：后端列表暂无搜索参数，前端过滤当前加载的条目 */
export function filterFavorites(favorites: FavoriteItem[], keyword: string): FavoriteItem[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return favorites
    return favorites.filter((f) => f.title.toLowerCase().includes(kw))
}

/**
 * 收藏数的折位文本（PRD-68 的折万口径与销量同一份——同一张卡片上「已售」和「收藏」不该各折各的）。
 *
 * **只给数字，不给句子**：「N 人收藏」那句进catalog（`t("web.favorite.collected")`，由 `FavoriteCard`
 * 拼），因为 `@shop/common` 不承载用户可见文案、且「人收藏」在英文里不是这么说的
 * （`12K people favorited`）。`locale` 必填（§3.5 约束 2）：折位单位由语言决定（zh 出「1.2万」、en 出「12K」）。
 */
export function collectCount(count: number, locale: AppLocale): string {
    return compactCount(count, locale)
}

/**
 * 批量选择的一次变化（收藏页的勾选集合）。
 *
 * 集合本身由页面 `useState` 持有（真实源在客户端，不进 query），这里只给纯转移：
 * 三个动作各自都要求「没变化时返回同一个引用」——否则一次无关的 setState 也会换掉整个
 * Set，把不相关的卡片全重渲染一遍。
 */

/** 空选择：稳定的模块级引用，退出批量模式与删除成功后都回到它 */
export const EMPTY_SELECTION: ReadonlySet<string> = new Set()

/** 点选一个商品：已选则取消，未选则加入 */
export function toggleSelection(
    selected: ReadonlySet<string>,
    productId: string,
): ReadonlySet<string> {
    const next = new Set(selected)
    // delete 返回「原本在不在」：不在就是这次要加进来
    if (!next.delete(productId)) next.add(productId)
    return next
}

/** 商品被移出收藏后，它的勾选一并作废；没勾过它就不换引用 */
export function dropSelection(
    selected: ReadonlySet<string>,
    productId: string,
): ReadonlySet<string> {
    if (!selected.has(productId)) return selected
    return toggleSelection(selected, productId)
}

/** 全选 / 全清：作用在当前筛选结果上，而不是整份收藏（勾掉搜索框里的关键词不该顺手选中没显示的商品） */
export function pickAllSelection(
    items: readonly { productId: string }[],
    checked: boolean,
): ReadonlySet<string> {
    return checked ? new Set(items.map((f) => f.productId)) : EMPTY_SELECTION
}
