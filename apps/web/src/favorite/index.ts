/**
 * favorite —— 收藏领域文件夹（扁形态：纯逻辑 + hook + 组件内聚）。
 * - favorite.ts     ：纯逻辑（投影映射 toFavoriteItem / 过滤 filterFavorites / 文案 collectText）
 * - queries.ts ：React 接线（列表 query + 乐观移除 + 详情页心形）
 * - FavoriteCard.tsx / Toolbar.tsx ：受控展示组件
 * 页面局部的 UI 态（keyword / batchMode / selected）由页面 useState 持有，不在这里。
 */

export { filterFavorites } from "./favorite"

export {
    favoriteItemsOptions,
    useFavoriteStatus,
    useRemoveFavorites,
    useToggleFavorite,
} from "./queries"

export { FavoriteCard } from "./FavoriteCard"
export { Toolbar } from "./Toolbar"
